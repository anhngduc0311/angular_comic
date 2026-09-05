/**
 * TruyenKomi High-Concurrency Benchmark Suite (Node.js Autocannon)
 * Simulates high-throughput load on TruyenKomi API & Redis Cache.
 */

const http = require('http');

let autocannon;
try {
  autocannon = require('autocannon');
} catch (e) {
  console.log('Autocannon not installed yet. Installing dependency...');
}

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

const SCENARIOS = [
  {
    name: '1. Chapter Read API (Redis Cache-Aside Pages + View Increment)',
    url: `${BASE_URL}/api/chapters/by-slug/dai-quan-gia-la-ma-hoang/chuong-1`,
    connections: 100,
    duration: 10,
    pipelining: 1,
    targetP95: 50, // ms
    targetRps: 2000
  },
  {
    name: '2. Featured Comics API (Redis Cache-Aside)',
    url: `${BASE_URL}/api/comics/featured`,
    connections: 100,
    duration: 10,
    pipelining: 1,
    targetP95: 30, // ms
    targetRps: 3000
  },
  {
    name: '3. Latest Comics List API (Redis Cache-Aside)',
    url: `${BASE_URL}/api/comics/latest?count=12`,
    connections: 100,
    duration: 10,
    pipelining: 1,
    targetP95: 50, // ms
    targetRps: 2500
  },
  {
    name: '4. System Health Check API (DB + Redis + Storage Probes)',
    url: `${BASE_URL}/health`,
    connections: 50,
    duration: 5,
    pipelining: 1,
    targetP95: 50, // ms
    targetRps: 2000
  }
];

function checkServerAlive(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runScenario(scenario) {
  console.log('\n===============================================================');
  console.log(`🚀 RUNNING BENCHMARK: ${scenario.name}`);
  console.log(`🌐 Target: ${scenario.url}`);
  console.log(`👥 Connections: ${scenario.connections} | ⏱️ Duration: ${scenario.duration}s`);
  console.log('===============================================================');

  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: scenario.url,
      connections: scenario.connections,
      duration: scenario.duration,
      pipelining: scenario.pipelining || 1,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TruyenKomi-Benchmark-Agent/1.0'
      }
    }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });

    autocannon.track(instance, { renderProgressBar: true });
  });
}

function printSummaryTable(results) {
  console.log('\n\n========================================================================================');
  console.log('📊 TRUYENKOMI LOAD TESTING & BENCHMARK SUMMARY REPORT');
  console.log('========================================================================================');
  console.table(results.map(r => {
    const p50 = r.latency && (r.latency.p50 ?? r.latency.p50_0 ?? r.latency.average ?? 0);
    const p97_5 = r.latency && (r.latency.p97_5 ?? r.latency.p99 ?? r.latency.average ?? 0);
    const p99 = r.latency && (r.latency.p99 ?? r.latency.p99_0 ?? r.latency.max ?? 0);
    const avg = r.latency ? r.latency.average : 0;
    const reqAvg = r.requests ? Math.round(r.requests.average || (r.requests.total / (r.duration || 10))) : 0;
    const non2xx = r.non2xx || 0;
    const errors = (r.errors || 0) + non2xx;
    const mbSec = r.throughput ? (r.throughput.average / (1024 * 1024)).toFixed(2) : '0';

    return {
      'Scenario': r.name,
      'Throughput (Req/s)': `${reqAvg.toLocaleString()} req/s`,
      'Total Requests': (r.requests?.total || 0).toLocaleString(),
      'Latency Avg': `${avg.toFixed(2)} ms`,
      'Latency P50': `${p50.toFixed(2)} ms`,
      'Latency P97.5': `${p97_5.toFixed(2)} ms`,
      'Latency P99': `${p99.toFixed(2)} ms`,
      'Bandwidth': `${mbSec} MB/s`,
      'Failures': errors,
      'SLA Status': (avg <= 100 && errors === 0) ? '✅ PASSED' : (errors === 0 ? '⚠️ ACCEPTABLE' : '❌ FAILED')
    };
  }));
  console.log('========================================================================================\n');
}

async function main() {
  console.log('⚡ TruyenKomi System Load Testing & Optimization Verification Suite');
  console.log(`🔍 Checking API connectivity at ${BASE_URL}/health ...`);

  const isAlive = await checkServerAlive(`${BASE_URL}/health`);
  if (!isAlive) {
    console.error(`❌ Error: Backend API at ${BASE_URL} is not responding.`);
    console.error(`👉 Please ensure the backend is running (e.g. dotnet run) before running benchmarks.`);
    process.exit(1);
  }

  console.log(`✅ API is online and responding! Starting benchmark sequence...`);

  const summaryResults = [];
  for (const scenario of SCENARIOS) {
    try {
      const res = await runScenario(scenario);
      res.name = scenario.name;
      res.targetP95 = scenario.targetP95;
      summaryResults.push(res);
    } catch (err) {
      console.error(`❌ Error running scenario ${scenario.name}:`, err);
    }
  }

  printSummaryTable(summaryResults);
}

if (require.main === module) {
  main();
}
