"""Service-to-service authentication.

The ML service is reachable only on the internal Docker network, but network
position is not an authorisation decision: anything that can reach the network
(a compromised container, a misconfigured port mapping) would otherwise have
full access to classification and embedding endpoints.
"""

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings

_UNAUTHORISED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={"code": "unauthorized", "message": "Valid service credentials are required"},
    headers={"WWW-Authenticate": "Bearer"},
)


def require_service_token(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Rejects any request without the shared service token.

    Compared with ``hmac.compare_digest`` so the comparison takes the same time
    whatever the supplied value, which keeps the token from being recoverable
    one character at a time.
    """
    if authorization is None:
        raise _UNAUTHORISED

    scheme, _, candidate = authorization.partition(" ")
    if scheme.lower() != "bearer" or not candidate:
        raise _UNAUTHORISED

    if not hmac.compare_digest(candidate, settings.service_token):
        raise _UNAUTHORISED
