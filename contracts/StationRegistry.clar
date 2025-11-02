;; StationRegistry.clar

(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-ALREADY-REGISTERED u101)
(define-constant ERR-NOT-REGISTERED u102)
(define-constant ERR-INVALID-LOCATION u103)
(define-constant ERR-INVALID-POWER u104)
(define-constant ERR-INVALID-STATUS u105)
(define-constant ERR-INVALID-PRICE u106)
(define-constant ERR-OWNERSHIP-TRANSFER-FAIL u107)
(define-constant ERR-STATION-NOT-OWNER u108)

(define-constant MAX-LOCATION-LENGTH u100)
(define-constant MAX-NAME-LENGTH u50)
(define-constant MAX-POWER-KW u1000)
(define-constant MIN-POWER-KW u1)

(define-data-var admin principal tx-sender)
(define-data-var registration-fee uint u1000000)
(define-data-var total-stations uint u0)

(define-map stations
  uint
  {
    name: (string-utf8 MAX-NAME-LENGTH),
    owner: principal,
    location: (string-utf8 MAX-LOCATION-LENGTH),
    power-kw: uint,
    price-per-kwh: uint,
    status: bool,
    registered-at: uint
  }
)

(define-map station-by-owner principal uint)
(define-map station-by-location (string-utf8 MAX-LOCATION-LENGTH) uint)

(define-read-only (get-station (id uint))
  (map-get? stations id)
)

(define-read-only (get-station-by-owner (owner principal))
  (map-get? station-by-owner owner)
)

(define-read-only (get-station-by-location (location (string-utf8 MAX-LOCATION-LENGTH)))
  (map-get? station-by-location location)
)

(define-read-only (is-registered (station principal))
  (is-some (map-get? station-by-owner station))
)

(define-read-only (get-total-stations)
  (ok (var-get total-stations))
)

(define-read-only (get-registration-fee)
  (ok (var-get registration-fee))
)

(define-private (validate-location (loc (string-utf8 MAX-LOCATION-LENGTH)))
  (and (> (len loc) u0) (<= (len loc) MAX-LOCATION-LENGTH))
)

(define-private (validate-name (name (string-utf8 MAX-NAME-LENGTH)))
  (and (> (len name) u0) (<= (len name) MAX-NAME-LENGTH))
)

(define-private (validate-power (power uint))
  (and (>= power MIN-POWER-KW) (<= power MAX-POWER-KW))
)

(define-private (validate-price (price uint))
  (> price u0)
)

(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (asserts! (> new-fee u0) (err ERR-INVALID-PRICE))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-station
  (name (string-utf8 MAX-NAME-LENGTH))
  (location (string-utf8 MAX-LOCATION-LENGTH))
  (power-kw uint)
  (price-per-kwh uint)
)
  (let (
        (station-id (var-get total-stations))
        (owner tx-sender)
      )
    (asserts! (is-none (map-get? station-by-owner owner)) (err ERR-ALREADY-REGISTERED))
    (try! (validate-name name))
    (try! (validate-location location))
    (try! (validate-power power-kw))
    (try! (validate-price price-per-kwh))
    (asserts! (is-none (map-get? station-by-location location)) (err ERR-ALREADY-REGISTERED))
    (try! (stx-transfer? (var-get registration-fee) tx-sender (var-get admin)))
    (map-set stations station-id
      {
        name: name,
        owner: owner,
        location: location,
        power-kw: power-kw,
        price-per-kwh: price-per-kwh,
        status: true,
        registered-at: block-height
      }
    )
    (map-set station-by-owner owner station-id)
    (map-set station-by-location location station-id)
    (var-set total-stations (+ station-id u1))
    (ok station-id)
  )
)

(define-public (update-station
  (station-id uint)
  (name (string-utf8 MAX-NAME-LENGTH))
  (location (string-utf8 MAX-LOCATION-LENGTH))
  (power-kw uint)
  (price-per-kwh uint)
)
  (let ((station (unwrap! (map-get? stations station-id) (err ERR-NOT-REGISTERED))))
    (asserts! (is-eq (get owner station) tx-sender) (err ERR-STATION-NOT-OWNER))
    (try! (validate-name name))
    (let ((old-location (get location station)))
      (if (not (is-eq old-location location))
        (begin
          (asserts! (is-none (map-get? station-by-location location)) (err ERR-ALREADY-REGISTERED))
          (map-delete station-by-location old-location)
          (map-set station-by-location location station-id)
        )
        (ok true)
      )
    )
    (try! (validate-power power-kw))
    (try! (validate-price price-per-kwh))
    (map-set stations station-id
      (merge station
        {
          name: name,
          location: location,
          power-kw: power-kw,
          price-per-kwh: price-per-kwh
        }
      )
    )
    (ok true)
  )
)

(define-public (toggle-status (station-id uint))
  (let ((station (unwrap! (map-get? stations station-id) (err ERR-NOT-REGISTERED))))
    (asserts! (is-eq (get owner station) tx-sender) (err ERR-STATION-NOT-OWNER))
    (map-set stations station-id
      (merge station { status: (not (get status station)) })
    )
    (ok true)
  )
)

(define-public (transfer-ownership (station-id uint) (new-owner principal))
  (let ((station (unwrap! (map-get? stations station-id) (err ERR-NOT-REGISTERED))))
    (asserts! (is-eq (get owner station) tx-sender) (err ERR-STATION-NOT-OWNER))
    (map-delete station-by-owner (get owner station))
    (map-set station-by-owner new-owner station-id)
    (map-set stations station-id
      (merge station { owner: new-owner })
    )
    (ok true)
  )
)

(define-public (deregister-station (station-id uint))
  (let ((station (unwrap! (map-get? stations station-id) (err ERR-NOT-REGISTERED))))
    (asserts! (or (is-eq (get owner station) tx-sender) (is-admin)) (err ERR-UNAUTHORIZED))
    (map-delete stations station-id)
    (map-delete station-by-owner (get owner station))
    (map-delete station-by-location (get location station))
    (var-set total-stations (- (var-get total-stations) u1))
    (ok true)
  )
)