"""Work around IPv6 connection stalls by preferring IPv4 at resolution time.

Some networks advertise an IPv6 route that hangs on connect. Python's socket
stack tries the addresses `getaddrinfo` returns in order, so when an IPv6
address comes first and stalls, requests/httpx (used by MSAL and Graph) block
for a long time — while curl avoids it via Happy-Eyeballs fallback. Reordering
so IPv4 comes first, while keeping IPv6 as a fallback, removes the stall without
disabling IPv6 for hosts that genuinely need it.

Imported for its side effect (applied on import). Must load before any network
call is made.
"""
import socket

_original_getaddrinfo = socket.getaddrinfo


def _ipv4_first(*args, **kwargs):
    results = _original_getaddrinfo(*args, **kwargs)
    return sorted(results, key=lambda r: 0 if r[0] == socket.AF_INET else 1)


def apply() -> None:
    if getattr(socket, "_tidemail_ipv4_first", False):
        return
    socket.getaddrinfo = _ipv4_first
    socket._tidemail_ipv4_first = True


apply()
