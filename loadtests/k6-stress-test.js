import http from 'k6/http';
import { check, sleep } from 'k6';

// Stress Testing: Push system to 10,000 VUs to determine breaking points & recovery
export const options = {
  stages: [
    { duration: '30s', target: 1000 },  // Ramp up to 1,000 VUs
    { duration: '1m',  target: 3000 },  // Scale to 3,000 VUs
    { duration: '1m',  target: 6000 },  // Scale to 6,000 VUs
    { duration: '1m',  target: 10000 }, // Maximum stress: 10,000 VUs
    { duration: '1m',  target: 10000 }, // Hold peak stress
    { duration: '45s', target: 0 },     // Ramp down and test system recovery
  ],
  thresholds: {
    'http_req_duration': ['p(95)<300'],
    'http_req_failed': ['rate<0.05'], // Allow up to 5% failure during extreme stress
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';

export default function () {
  // Test reading chapter under maximum stress
  const res = http.get(`${BASE_URL}/comics/dai-quan-gia-la-ma-hoang/chapters/1`);
  check(res, {
    'Status is 200': (r) => r.status === 200,
  });
  sleep(0.5);
}
