# Registered meeting location checks (request protocol v2)

This is a backend safeguard, not verified physical attendance. It rejects invented meetings and self-reported locations outside an operator-approved boundary. A malicious device can still submit a false GPS location. No on-site QR challenge, organizer attestation, durable session storage, or signed checkout receipt is implemented here. Do not use this prototype to certify court, probation, insurance, or treatment attendance.

## Operator setup

Create a private JSON file outside the served web directories. Set `STAMP_MEETINGS_FILE` to its absolute path in the backend process environment before startup. There is deliberately no public meeting registration endpoint. The operator is responsible for authenticating the facility/organizer and approving the meeting's location and schedule. Restart after changing the file; active sessions hold the policy loaded at startup.

The file is an array of objects with exactly these fields:

```json
[
  {
    "id": "synthetic-test-session",
    "latitude": 44.95,
    "longitude": -93.09,
    "radiusMeters": 150,
    "maxAccuracyMeters": 50,
    "startsAt": 1800000000000,
    "endsAt": 1800003600000,
    "minimumDurationMs": 2700000
  }
]
```

These are synthetic example coordinates and Unix timestamps in milliseconds, not a registered meeting. Use a unique ID for each actual meeting occurrence. Choose a defensible radius for the venue; the maximum supported radius is 500 meters. The entire reported accuracy circle must fit inside that radius. No file means no accepted meetings. Invalid files, duplicate IDs, inverted schedules, or impossible duration/accuracy settings fail route registration at startup.

Both check-in and checkout must arrive between `startsAt` and `endsAt` according to server time, with a device location timestamp within two minutes of server time. A checkout outside the window does not certify attendance and currently needs a separate future exception-review workflow. Too-early checkout returns 409 and leaves the session active. The duration is elapsed server time, not continuous presence: leaving and returning remains possible.

## Breaking client change

Legacy signatures are rejected rather than silently treated as sufficient evidence. Existing demo/mobile clients require a v2 update before they can use these endpoints. Request version is the number `2`, coordinates are numbers, accuracy is the positive `coords.accuracy` value in meters, timestamp is integer milliseconds, and participant key/signature are hex Ed25519 values.

For check-in sign the UTF-8 encoding of this exact JSON array (normal `JSON.stringify`, no whitespace):

```js
["stamp.checkin.v2", participantToken, meetingId,
 latitude, longitude, accuracyMeters, timestamp]
```

Send `version`, `participantToken`, `meetingId`, `latitude`, `longitude`, `accuracyMeters`, `timestamp`, and `signature` to `POST /api/checkin`.

For checkout sign:

```js
["stamp.checkout.v2", participantToken, sessionId, serverCheckinTime,
 latitude, longitude, accuracyMeters, timestamp]
```

Send `version`, `participantToken`, `sessionId`, `latitude`, `longitude`, `accuracyMeters`, `timestamp`, and `signature` to `POST /api/checkout`. `serverCheckinTime` comes from the successful check-in response and is included in the signature, not the checkout body. Obtain a fresh location fix for checkout.

Signing these fields prevents a third party from substituting different coordinates on a captured request. It does not make a participant's false coordinates true. Exact location/accuracy is validated transiently rather than added to the session record; existing TSCB proofs still expose approximate geohash locations and require further privacy review.

## Remaining trust gaps and next work

1. Authenticate an organizer and deliver a rotating, session-specific on-site challenge for check-in and checkout. Bind challenge IDs/nonces to participant signatures; enforce expiry and replay protection. QR codes can be relayed and must not be advertised as unforgeable physical presence.
2. Persist sessions and trusted facility keys across restart, with access control and retention policy.
3. Sign the full final session receipt (participant binding, meeting policy/version, check-in/out time, evidence checks and duration). Update the offline verifier to require and verify that receipt. Its current PASS is a legacy proof integrity result, not an independently verified duration or attendance determination; exported metadata remains editable.
4. Connect a real participant UI and test the full flow, including absent users and location-denied/inaccurate devices.

## Validation

`npm test --workspace=backend -- --runInBand` exercises the registry and API with real Ed25519 signatures. It rejects invented meetings, outside/stale/inaccurate locations, altered signed coordinates, legacy request versions, early/outside checkout, and duplicate checkout; a registered, in-area, sufficiently long session completes under a controlled clock. These are software regression tests, not field tests of location authenticity.
