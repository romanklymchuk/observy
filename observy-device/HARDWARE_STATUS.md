# Observy Alpha-01 — Hardware Status

## Validated

- [x] Raspberry Pi Zero 2 W boots Raspberry Pi OS
- [x] Wi-Fi connectivity
- [x] mDNS hostname: observy-alpha-01.local
- [x] SSH access
- [x] Node.js / npm runtime on ARM64
- [x] Observy device runtime on Raspberry Pi
- [x] Camera Module 3 / IMX708 detected
- [x] Camera HAL health check
- [x] Real 2304x1296 JPEG capture
- [x] Continuous autofocus capture
- [x] Full runtime with real camera
- [x] Pi -> Observy API upload over LAN
- [x] Offline queue on Raspberry Pi
- [x] Queue recovery after API reconnect
- [x] Telemetry heartbeat
- [x] I2C enabled (/dev/i2c-1)

## In Progress

- [ ] BME/P280 detected on I2C
- [ ] Real environmental measurements
- [ ] Real microphone capture
- [ ] Real motion trigger
- [ ] systemd autostart
- [ ] Long-running burn-in

## Vision

- [x] Python vision environment
- [x] OpenCV installed
- [x] Sharpness analyzer implemented
- [ ] Sharpness analyzer validated on IMX708 burst
- [ ] YOLO detection spike
- [ ] Best Frame scoring
- [ ] Burst capture integration
- [ ] Runtime PROCESSING integration

## Alpha-01 Target

Real trigger
-> real camera
-> real audio
-> real environmental sensors
-> processing
-> upload / offline queue
-> Observy API
