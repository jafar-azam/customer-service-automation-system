import type { Env } from '@csas/shared';
import { Router, type Request } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { requireCustomer } from '../http/authenticate.js';
import { ApiError } from '../http/errors.js';
import { rateLimit } from '../http/rate-limit-middleware.js';
import { validate } from '../http/validate.js';
import { customerScope } from '../repositories/scope.js';
import { findTicket } from '../repositories/tickets.js';
import type { EmbeddingsProvider } from '../services/providers/embeddings.js';
import type { LlmProvider } from '../services/providers/llm.js';
import { respond } from '../services/rag/respond.js';
import type { KnowledgeIndex } from '../services/rag/retrieve.js';
import type { TicketEvents } from '../realtime/events.js';
import { presentMessage } from './tickets.js';

/**
 * Asking the assistant about a ticket.
 *
 * A generation can take seconds on a local model, so this is its own endpoint
 * rather than something `POST /messages` does inline. Posting a message stays
 * fast and the answer arrives over the socket, which is also what makes a
 * future streaming reply a change here and nowhere else.
 */

const askSchema = z.strictObject({
  /* Bounded. A question longer than this is a pasted log file, which belongs
     in an attachment where it can be scanned — and a very long prompt is the
     cheapest way to make a local model slow. */
  question: z.string().trim().min(2).max(2_000),
});

/* Generation is the most expensive thing a customer can ask for, so it has
   the tightest limit of any route here. */
const ASK_LIMIT = { name: 'assistant:ask', limit: 30, windowSeconds: 3_600 };

export interface AssistantRouterOptions {
  readonly env: Env;
  readonly logger: Logger;
  readonly index: KnowledgeIndex;
  readonly embeddings: EmbeddingsProvider;
  readonly llm: LlmProvider;
  readonly events: TicketEvents;
}

export function assistantRouter({
  env,
  logger,
  index,
  embeddings,
  llm,
  events,
}: AssistantRouterOptions): Router {
  const router = Router();
  const guard = requireCustomer({ env });

  router.post(
    '/:id/ask',
    guard,
    rateLimit(ASK_LIMIT),
    validate({ params: z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) }), body: askSchema }),
    (req: Request, res, next) => {
      if (!env.ASSISTANT_ENABLED) {
        next(new ApiError(503, 'assistant_disabled', 'The assistant is not available'));
        return;
      }

      const customerId = req.customerActor?.customerId;
      if (customerId === undefined) {
        next(new ApiError(401, 'unauthenticated', 'Authentication is required'));
        return;
      }

      const ticketId = String(req.params['id']);
      const { question } = req.body as z.infer<typeof askSchema>;

      /* The ownership check happens here, under the *customer's* scope, before
         anything else runs. `respond` then works as the system — it has to, to
         write an assistant message — so this is the only place the caller's
         identity is checked, and it must not be skipped. */
      findTicket(customerScope(customerId), ticketId)
        .then(() => respond(ticketId, question, { index, embeddings, llm, logger }))
        .then(({ outcome, message, ticket }) => {
          events.messagePosted(ticket, message);
          events.ticketUpdated(ticket);

          res.status(201).json({
            message: presentMessage(message),
            /* The outcome is reported, including a refusal. A client that
               cannot tell "answered" from "escalated" cannot show the
               customer what happened. */
            outcome:
              outcome.kind === 'answered'
                ? {
                    kind: 'answered',
                    confidence: outcome.confidence,
                    sources: outcome.citations.length,
                  }
                : { kind: 'escalated', reason: outcome.reason, confidence: outcome.confidence },
            ticketStatus: ticket.status,
          });
        })
        .catch(next);
    },
  );

  return router;
}
