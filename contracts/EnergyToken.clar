(define-fungible-token energy-token)

(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-NOT-OWNER u101)
(define-constant ERR-INSUFFICIENT-BALANCE u102)
(define-constant ERR-TRANSFER-FAILED u103)
(define-constant ERR-MINT-FAILED u104)
(define-constant ERR-BURN-FAILED u105)
(define-constant ERR-ALREADY-INITIALIZED u106)
(define-constant ERR-NOT-INITIALIZED u107)

(define-data-var token-owner principal tx-sender)
(define-data-var initialized bool false)
(define-data-var total-supply uint u0)

(define-map allowances
  { owner: principal, spender: principal }
  uint
)

(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance energy-token account))
)

(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances { owner: owner, spender: spender })))
)

(define-read-only (get-owner)
  (ok (var-get token-owner))
)

(define-read-only (is-initialized)
  (ok (var-get initialized))
)

(define-private (is-owner)
  (is-eq tx-sender (var-get token-owner))
)

(define-public (initialize (initial-supply uint) (recipient principal))
  (begin
    (asserts! (not (var-get initialized)) (err ERR-ALREADY-INITIALIZED))
    (asserts! (is-owner) (err ERR-UNAUTHORIZED))
    (try! (ft-mint? energy-token initial-supply recipient))
    (var-set total-supply initial-supply)
    (var-set initialized true)
    (ok true)
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (var-get initialized) (err ERR-NOT-INITIALIZED))
    (asserts! (or (is-eq tx-sender sender) (is-eq tx-sender recipient)) (err ERR-UNAUTHORIZED))
    (asserts! (>= (ft-get-balance energy-token sender) amount) (err ERR-INSUFFICIENT-BALANCE))
    (try! (ft-transfer? energy-token amount sender recipient))
    (match memo data (print { event: "transfer-memo", memo: data }) (ok true))
    (ok true)
  )
)

(define-public (approve (spender principal) (amount uint))
  (begin
    (asserts! (var-get initialized) (err ERR-NOT-INITIALIZED))
    (map-set allowances
      { owner: tx-sender, spender: spender }
      amount
    )
    (ok true)
  )
)

(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (let ((allowance (default-to u0 (map-get? allowances { owner: owner, spender: tx-sender }))))
    (asserts! (var-get initialized) (err ERR-NOT-INITIALIZED))
    (asserts! (>= allowance amount) (err ERR-INSUFFICIENT-BALANCE))
    (asserts! (>= (ft-get-balance energy-token owner) amount) (err ERR-INSUFFICIENT-BALANCE))
    (try! (ft-transfer? energy-token amount owner recipient))
    (map-set allowances
      { owner: owner, spender: tx-sender }
      (- allowance amount)
    )
    (ok true)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (var-get initialized) (err ERR-NOT-INITIALIZED))
    (asserts! (is-owner) (err ERR-UNAUTHORIZED))
    (try! (ft-mint? energy-token amount recipient))
    (var-set total-supply (+ (var-get total-supply) amount))
    (ok true)
  )
)

(define-public (burn (amount uint) (sender principal))
  (begin
    (asserts! (var-get initialized) (err ERR-NOT-INITIALIZED))
    (asserts! (or (is-eq tx-sender sender) (is-owner)) (err ERR-UNAUTHORIZED))
    (asserts! (>= (ft-get-balance energy-token sender) amount) (err ERR-INSUFFICIENT-BALANCE))
    (try! (ft-burn? energy-token amount sender))
    (var-set total-supply (- (var-get total-supply) amount))
    (ok true)
  )
)

(define-public (set-owner (new-owner principal))
  (begin
    (asserts! (is-owner) (err ERR-UNAUTHORIZED))
    (var-set token-owner new-owner)
    (ok true)
  )
)

(define-public (revoke-allowance (spender principal))
  (begin
    (asserts! (var-get initialized) (err ERR-NOT-INITIALIZED))
    (map-delete allowances { owner: tx-sender, spender: spender })
    (ok true)
  )
)