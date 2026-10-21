# Security policy

## Supported versions

Only the latest release of the RecycleApp integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-recycleapp](https://github.com/prohand/gladys-recycleapp/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens and your home address first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), and
RecycleApp / Fost Plus and their API, which this integration only reads.

## What the integration handles

- **Your address** (zip code, street, house number) is sent to the RecycleApp API
  (`api.fostplus.be`), exactly as the recycleapp.be website does, and nowhere else.
  It is stored in the Gladys configuration and, with the calendar read, in
  `/data/recycleapp-state.json` inside the integration volume.
- **No credentials**: RecycleApp needs no account and no key, so the integration
  holds no secret.
- **Outbound traffic only**, over HTTPS, to `api.fostplus.be` and
  `assets.recycleapp.be` (waste type logos). The integration opens no port.
- The container runs as a non-root user on a read-only root filesystem; `/data` is
  its only writable path.

## Good practices for users

- Keep Gladys and the integration up to date.
- When you share logs, remove your address from them.
