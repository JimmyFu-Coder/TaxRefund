/**
 * Throughput Test Script for Lambda Functions
 * Tests the processing capacity of the TaxRefund Lambda architecture
 *
 * Usage: node throughput-test.js [concurrent_requests] [total_requests]
 *
 * Example: node throughput-test.js 10 100
 */

const AWS = require('aws-sdk');

// Configuration
const CONFIG = {
  region: 'us-east-1',
  functionName: 'taxrefund-ocr',
  // Sample 1x1 pixel PNG base64
  testImageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
};

// Initialize Lambda client
const lambda = new AWS.Lambda({ region: CONFIG.region });

// Results storage
const results = {
  total: 0,
  success: 0,
  failed: 0,
  latencies: [],
  startTime: null,
  endTime: null
};

/**
 * Invoke Lambda function
 */
async function invokeLambda(payload) {
  const startTime = Date.now();

  try {
    const response = await lambda.invoke({
      FunctionName: CONFIG.functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
      // Set a timeout
      ...{ invoke: { executionTimeout: 30 } }
    }).promise();

    const endTime = Date.now();
    const latency = endTime - startTime;

    return {
      success: true,
      latency,
      statusCode: response.StatusCode,
      response: response.Payload ? JSON.parse(response.Payload) : null
    };
  } catch (error) {
    const endTime = Date.now();
    const latency = endTime - startTime;

    return {
      success: false,
      latency,
      error: error.message
    };
  }
}

/**
 * Run concurrent test
 */
async function runConcurrentTest(concurrentCount, totalRequests) {
  console.log(`\n========================================`);
  console.log(`Throughput Test Configuration`);
  console.log(`========================================`);
  console.log(`Function: ${CONFIG.functionName}`);
  console.log(`Concurrent Requests: ${concurrentCount}`);
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`========================================\n`);

  results.total = totalRequests;
  results.startTime = Date.now();

  const batches = Math.ceil(totalRequests / concurrentCount);
  console.log(`Running ${batches} batches of ${concurrentCount} concurrent requests...\n`);

  let completed = 0;

  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(concurrentCount, totalRequests - completed);
    const promises = [];

    for (let i = 0; i < batchSize; i++) {
      const payload = {
        httpMethod: 'POST',
        body: JSON.stringify({
          imageBase64: CONFIG.testImageBase64
        })
      };

      promises.push(invokeLambda(payload).then(result => {
        completed++;
        processResult(result);
        printProgress(completed, totalRequests);
      }));
    }

    await Promise.all(promises);
  }

  results.endTime = Date.now();

  return results;
}

/**
 * Process individual result
 */
function processResult(result) {
  if (result.success) {
    results.success++;
  } else {
    results.failed++;
  }
  results.latencies.push(result.latency);
}

/**
 * Print progress
 */
function printProgress(completed, total) {
  const percent = ((completed / total) * 100).toFixed(1);
  process.stdout.write(`\rProgress: ${completed}/${total} (${percent}%)`);
}

/**
 * Calculate and print statistics
 */
function printStatistics(results) {
  const duration = (results.endTime - results.startTime) / 1000;
  const latencies = results.latencies.sort((a, b) => a - b);

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const minLatency = latencies[0];
  const maxLatency = latencies[latencies.length - 1];
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const throughput = results.success / duration;
  const errorRate = (results.failed / results.total) * 100;

  console.log('\n\n========================================');
  console.log('Throughput Test Results');
  console.log('========================================');
  console.log(`\n📊 Request Statistics:`);
  console.log(`   Total Requests: ${results.total}`);
  console.log(`   Successful: ${results.success}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Error Rate: ${errorRate.toFixed(2)}%`);

  console.log(`\n⏱️  Latency (ms):`);
  console.log(`   Average: ${avgLatency.toFixed(2)}`);
  console.log(`   Min: ${minLatency}`);
  console.log(`   Max: ${maxLatency}`);
  console.log(`   P50 (Median): ${p50}`);
  console.log(`   P95: ${p95}`);
  console.log(`   P99: ${p99}`);

  console.log(`\n🚀 Throughput:`);
  console.log(`   Duration: ${duration.toFixed(2)} seconds`);
  console.log(`   Requests/sec: ${throughput.toFixed(2)}`);

  console.log('\n========================================');

  return {
    total: results.total,
    success: results.success,
    failed: results.failed,
    errorRate: errorRate.toFixed(2),
    avgLatency: avgLatency.toFixed(2),
    p50,
    p95,
    p99,
    duration: duration.toFixed(2),
    throughput: throughput.toFixed(2)
  };
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const concurrentCount = parseInt(args[0]) || 10;
  const totalRequests = parseInt(args[1]) || 50;

  console.log('Starting Lambda Throughput Test...');
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    const results = await runConcurrentTest(concurrentCount, totalRequests);
    const stats = printStatistics(results);

    // Save results to file
    const fs = require('fs');
    const filename = `throughput-test-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(stats, null, 2));
    console.log(`\nResults saved to: ${filename}`);

  } catch (error) {
    console.error('Error running test:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { runConcurrentTest, invokeLambda };