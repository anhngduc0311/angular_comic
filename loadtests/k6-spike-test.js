import http from 'k6/http';
import { check, sleep } from 'k6';

// Spike Testing: Simulates flash traffic spikes (e.g. push notification sent to 1M users)
export const options = {
  stages: [
    { duration: '10s', target: 50 },    // Baseline normal traffic
    { duration: '10s', target: 5000 },  // Flash SPIKE to 5,000 VUs in 10s!
    { duration: '40s', target: 5000 },  // Hold spike
    { duration: '15s', target: 50 },    // Spike subsides
    { duration: '20s', target: 50 },    // Observe system cool-down & cache stability
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200'],
    'http_req_failed': ['rate<0.02'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';

export default function () {
  const res = http.get(`${BASE_URL}/comics/hot`);
  check(res, {
    'Status is 200': (r) => r.status === 200,
  });
  sleep(0.3);
}
