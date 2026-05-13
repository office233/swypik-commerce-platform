#!/bin/bash
curl -s -X POST https://swypik.com/api/checkout \
  -H 'Content-Type: application/json' \
  -d '{"products":[{"productId":"d2ca1293-e46f-45e3-9f89-cdf4ea79b0da","quantity":1}]}'
