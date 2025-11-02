;; RewardsDistributor.clar

(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-SESSION u101)
(define-constant ERR-ALREADY-CLAIMED u102)
(define-constant ERR-INVALID-AMOUNT u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-ORACLE-NOT-SET u105)
(define-constant ERR-STATION-NOT-REGISTERED u106)
(define-constant ERR-USER-NOT-REGISTERED u107)
(define-constant ERR-REWARD-CALC-FAIL u108)
(define-constant ERR-TOKEN-MINT-FAIL u109)
(define-constant ERR-SESSION-EXPIRED u110)
(define-constant ERR-INVALID-PROOF u111)
(define-constant ERR-MAX-REWARD-EXCEEDED u112)

(define-constant REWARD-BASE-RATE u100)
(define-constant OFF-PEAK-MULTIPLIER u200)
(define-constant PEAK-MULTIPLIER u50)
(define-constant MAX-KWH-PER-SESSION u500)
(define-constant SESSION-TIMEOUT u1440)
(define-constant MAX-DAILY-REWARD u10000)

(define-data-var oracle-principal (optional principal) none)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78.energy-token)
(define-data-var station-registry principal 'SP000000000000000000002Q6VF78.station-registry)
(define-data-var user-registry principal 'SP000000000000000000002Q6VF78.user-registry)
(define-data-var total-rewards-issued uint u0)
(define-data-var reward-nonce uint u0)

(define-map sessions
  { session-id: uint }
  {
    user: principal,
    station: principal,
    kwh: uint,
    timestamp: uint,
    off-peak: bool,
    claimed: bool,
    proof-hash: (buff 32)
  }
)

(define-map user-daily-rewards
  { user: principal, day: uint }
  uint
)

(define-map session-nonce principal uint)

(define-read-only (get-session (session-id uint))
  (map-get? sessions { session-id: session-id })
)

(define-read-only (get-oracle)
  (var-get oracle-principal)
)

(define-read-only (get-total-rewards)
  (ok (var-get total-rewards-issued))
)

(define-read-only (calculate-reward-amount (kwh uint) (off-peak bool))
  (let (
        (base (* kwh REWARD-BASE-RATE))
        (multiplier (if off-peak OFF-PEAK-MULTIPLIER PEAK-MULTIPLIER))
      )
    (ok (/ (* base multiplier) u100))
  )
)

(define-private (validate-kwh (kwh uint))
  (and (> kwh u0) (<= kwh MAX-KWH-PER-SESSION))
)

(define-private (validate-timestamp (ts uint))
  (let ((current block-height))
    (and (>= ts (- current SESSION-TIMEOUT)) (<= ts current))
  )
)

(define-private (is-station-registered (station principal))
  (contract-call? (var-get station-registry) is-registered station)
)

(define-private (is-user-registered (user principal))
  (contract-call? (var-get user-registry) is-registered user)
)

(define-private (verify-proof (session-id uint) (proof (buff 32)) (user principal) (station principal) (kwh uint) (ts uint))
  (let ((expected (sha256 (concat (concat (concat (concat (concat (concat (uint-to-ascii session-id) (principal-to-ascii user)) (principal-to-ascii station)) (uint-to-ascii kwh)) (uint-to-ascii ts)) (uint-to-ascii block-height))))))
    (is-eq proof expected)
  )
)

(define-private (update-daily-cap (user principal) (amount uint))
  (let (
        (day (/ block-height u1440))
        (current (default-to u0 (map-get? user-daily-rewards { user: user, day: day })))
      )
    (if (> (+ current amount) MAX-DAILY-REWARD)
        (err ERR-MAX-REWARD-EXCEEDED)
        (begin
          (map-set user-daily-rewards { user: user, day: day } (+ current amount))
          (ok true)
        )
      )
  )
)

(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get oracle-principal) (err ERR-UNAUTHORIZED))) (err ERR-UNAUTHORIZED))
    (var-set oracle-principal (some new-oracle))
    (ok true)
  )
)

(define-public (set-token-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get oracle-principal) (err ERR-UNAUTHORIZED))) (err ERR-UNAUTHORIZED))
    (var-set token-contract new-contract)
    (ok true)
  )
)

(define-public (set-station-registry (registry principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get oracle-principal) (err ERR-UNAUTHORIZED))) (err ERR-UNAUTHORIZED))
    (var-set station-registry registry)
    (ok true)
  )
)

(define-public (set-user-registry (registry principal))
  (begin
    (asserts! (is-eq tx-sender (unwrap! (var-get oracle-principal) (err ERR-UNAUTHORIZED))) (err ERR-UNAUTHORIZED))
    (var-set user-registry registry)
    (ok true)
  )
)

(define-public (submit-session
  (station principal)
  (kwh uint)
  (timestamp uint)
  (proof (buff 32))
)
  (let (
        (session-id (var-get reward-nonce))
        (user tx-sender)
        (off-peak (default-to false (contract-call? (unwrap! (var-get oracle-principal) (err ERR-ORACLE-NOT-SET)) is-off-peak timestamp)))
      )
    (try! (contract-call? (var-get user-registry) assert-registered user))
    (try! (contract-call? (var-get station-registry) assert-registered station))
    (asserts! (validate-kwh kwh) (err ERR-INVALID-AMOUNT))
    (asserts! (validate-timestamp timestamp) (err ERR-INVALID-TIMESTAMP))
    (asserts! (verify-proof session-id proof user station kwh timestamp) (err ERR-INVALID-PROOF))
    (map-set sessions
      { session-id: session-id }
      {
        user: user,
        station: station,
        kwh: kwh,
        timestamp: timestamp,
        off-peak: off-peak,
        claimed: false,
        proof-hash: proof
      }
    )
    (var-set reward-nonce (+ session-id u1))
    (ok session-id)
  )
)

(define-public (claim-reward (session-id uint))
  (let (
        (session (unwrap! (map-get? sessions { session-id: session-id }) (err ERR-INVALID-SESSION)))
        (user (get user session))
      )
    (asserts! (is-eq tx-sender user) (err ERR-UNAUTHORIZED))
    (asserts! (not (get claimed session)) (err ERR-ALREADY-CLAIMED))
    (let ((reward (try! (calculate-reward-amount (get kwh session) (get off-peak session)))))
      (try! (update-daily-cap user reward))
      (try! (as-contract (contract-call? (var-get token-contract) mint reward user)))
      (map-set sessions
        { session-id: session-id }
        (merge session { claimed: true })
      )
      (var-set total-rewards-issued (+ (var-get total-rewards-issued) reward))
      (ok reward)
    )
  )
)

(define-public (get-user-rewards-today (user principal))
  (ok (default-to u0 (map-get? user-daily-rewards { user: user, day: (/ block-height u1440) })))
)

(define-public (get-pending-reward (session-id uint))
  (let ((session (unwrap! (map-get? sessions { session-id: session-id }) (err ERR-INVALID-SESSION))))
    (asserts! (not (get claimed session)) (err ERR-ALREADY-CLAIMED))
    (calculate-reward-amount (get kwh session) (get off-peak session))
  )
)