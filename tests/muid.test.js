/**
 * @fileoverview Unit tests for MUID (Monotonically Unique ID) generator - Espruino compatible
 */

// Import the MUID module (adjust path as needed)

const test = require('node:test');
const assert = require('node:assert');
const muid = require('../src/muid.js');


// Helper functions for 64-bit value comparison
function values64Equal(a, b) {
  return a.high === b.high && a.low === b.low;
}

function value64ToNumber(value) {
  if (value.high === 0) {
    return value.low;
  }
  // For larger values, we'll compare as strings or parts
  return value.high * 0x100000000 + value.low;
}

test('should create a MUID with number value', function () {
    var id = new muid.MUID(12345);
    assert.strictEqual(id.value.high, 0);
    assert.strictEqual(id.value.low, 12345);
  });

test('should create a MUID with 64-bit value object', function () {
    var value64 = muid.make64(1, 12345);
    var id = new muid.MUID(value64);
    assert.strictEqual(id.value.high, 1);
    assert.strictEqual(id.value.low, 12345);
  });

test('should return base32 string representation', function () {
    var id = new muid.MUID(12345);
    var expected = (12345).toString(32);
    assert.strictEqual(id.toString(), expected);
  });

test('should return hex string representation', function () {
    var id = new muid.MUID(255);
    assert.strictEqual(id.toHex(), 'ff');
  });

test('should return decimal string representation', function () {
    var id = new muid.MUID(12345);
    assert.strictEqual(id.toDecimal(), '12345');
  });

test('should return 64-bit value from valueOf', function () {
    var id = new muid.MUID(12345);
    var value = id.valueOf();
    assert.strictEqual(value.high, 0);
    assert.strictEqual(value.low, 12345);
  });

test('should create 64-bit values correctly', function () {
    var value = muid.make64(1, 2);
    assert.strictEqual(value.high, 1);
    assert.strictEqual(value.low, 2);
  });

test('should convert 32-bit to 64-bit', function () {
    var id = muid.from32(12345);
    assert.strictEqual(id.high, 0);
    assert.strictEqual(id.low, 12345);
  });

test('should add 64-bit numbers', function () {
    var a = muid.make64(0, 0xFFFFFFFF);
    var b = muid.make64(0, 1);
    var result = muid.add64(a, b);
    assert.strictEqual(result.high, 1);
    assert.strictEqual(result.low, 0);
  });

test('should subtract 64-bit numbers', function () {
    var a = muid.make64(1, 0);
    var b = muid.make64(0, 1);
    var result = muid.sub64(a, b);
    assert.strictEqual(result.high, 0);
    assert.strictEqual(result.low, 0xFFFFFFFF);
  });

      test('should shift left 64-bit numbers', function () {
    var value = muid.make64(0, 1);
    var result = muid.shl64(value, 1);
    assert.strictEqual(result.high, 0);
    assert.strictEqual(result.low, 2);
  });

test('should shift right 64-bit numbers', function () {
    var value = muid.make64(0, 4);
    var result = muid.shr64(value, 2);
    assert.strictEqual(result.high, 0);
    assert.strictEqual(result.low, 1);
  });

test('should compare 64-bit numbers', function () {
    var a = muid.make64(0, 1);
    var b = muid.make64(0, 2);
    var c = muid.make64(1, 0);

    assert.strictEqual(muid.cmp64(a, b), -1);
    assert.strictEqual(muid.cmp64(b, a), 1);
    assert.strictEqual(muid.cmp64(a, a), 0);
    assert.strictEqual(muid.cmp64(c, b), 1);
  });

test('should return valid default config', function () {
    var config = muid.getDefaultConfig();
    assert.strictEqual(config.timestampBitLen, 41);
    assert.strictEqual(config.machineIDBitLen, 14);
    assert.ok(typeof config.epoch === 'object');
    assert.ok(typeof config.epoch.high === 'number');
    assert.ok(typeof config.epoch.low === 'number');
    assert.ok(typeof config.machineID === 'object');
    assert.ok(typeof config.machineID.high === 'number');
    assert.ok(typeof config.machineID.low === 'number');
  });

test('should have machineID within valid range', function () {
    var config = muid.getDefaultConfig();
    var maxMachineID = (1 << config.machineIDBitLen) - 1;
    assert.ok(config.machineID.high === 0); // Should fit in low 32 bits
    assert.ok(config.machineID.low >= 0);
    assert.ok(config.machineID.low <= maxMachineID);
  });

test('should create generator with correct configuration', function () {
    var config = {
      machineID: muid.from32(123),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    assert.ok(values64Equal(generator.machineID, muid.from32(123)));
    assert.strictEqual(generator.timestampBitLen, 41);
    assert.strictEqual(generator.machineIDBitLen, 14);
  });

test('should generate unique MUIDs', function () {
    var config = {
      machineID: muid.from32(123),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    var id1 = generator.id();
    var id2 = generator.id();
    assert.ok(id1 instanceof muid.MUID);
    assert.ok(id2 instanceof muid.MUID);
    assert.ok(!values64Equal(id1.value, id2.value));
  });

test('should generate monotonically increasing IDs', function () {
    var config = {
      machineID: muid.from32(123),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    var ids = [];
    for (var i = 0; i < 100; i++) {
      ids.push(generator.id().value);
    }

    for (var i = 1; i < ids.length; i++) {
      assert.ok(muid.cmp64(ids[i], ids[i - 1]) > 0, 'ID at index ' + i + ' should be greater than previous');
    }
  });

test('should handle rapid generation within same millisecond', function () {
    var config = {
      machineID: muid.from32(123),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    var ids = [];
    var count = 100; // Reduced for Espruino performance

    for (var i = 0; i < count; i++) {
      var id = generator.id().value;
      // Check for duplicates
      for (var j = 0; j < ids.length; j++) {
        assert.ok(!values64Equal(id, ids[j]), 'Generated duplicate ID');
      }
      ids.push(id);
    }

    assert.strictEqual(ids.length, count);
  });

test('should mask machine ID to configured bit length', function () {
    var largeMachineID = 0xFFFFFFFF; // Large number
    var config = {
      machineID: muid.from32(largeMachineID),
      machineIDBitLen: 8,  // Only 8 bits allowed
      timestampBitLen: 41,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var gen = new muid.Generator(config, 0, 0);
    assert.strictEqual(gen.machineID.high, 0);
    assert.strictEqual(gen.machineID.low, 0xFF); // Should be masked to 8 bits
  });

test('should use default values for missing config', function () {
    var gen = new muid.Generator({});
    assert.strictEqual(gen.timestampBitLen, 41);
    assert.strictEqual(gen.machineIDBitLen, 14);
  });

test('should handle counter overflow by incrementing timestamp', function () {
    var config = {
      machineID: muid.from32(1),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    // Simulate counter near overflow
    var counterBits = 64 - 41 - 14 - 0; // 9 bits
    var maxCounter = muid.sub64(muid.shl64(muid.from32(1), counterBits), muid.from32(1));

    // Set state to near overflow  
    var now = muid.sub64(muid.from32(Date.now() & 0xFFFFFFFF), generator.epoch);
    generator.state = muid.or64(muid.shl64(now, counterBits), maxCounter);

    var id1 = generator.id();
    var id2 = generator.id();

    // Both should be valid and different
    assert.ok(!values64Equal(id1.value, id2.value));
    assert.ok(muid.cmp64(id2.value, id1.value) > 0);
  });

test('should handle clock going backwards', function () {
    var config = {
      machineID: muid.from32(1),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    // Generate an ID to establish a timestamp
    var id1 = generator.id();

    // Mock Date.now to return an earlier time
    var originalDateNow = Date.now;
    Date.now = function () {
      return 1700000001000; // Earlier timestamp
    };

    try {
      var id2 = generator.id();

      // ID should still be monotonic despite clock regression
      assert.ok(muid.cmp64(id2.value, id1.value) > 0);
    } finally {
      Date.now = originalDateNow;
    }
  });

test('should create multiple generators', function () {
    var shards = new muid.ShardedGenerators();
    assert.ok(shards.pool.length > 0);
    assert.ok(shards.size > 0);
    assert.strictEqual(shards.pool.length, shards.size);
  });

  test('should return generators in round-robin fashion', function () {
    var shards = new muid.ShardedGenerators();
    var gen1 = shards.next();
    var gen2 = shards.next();

    if (shards.size > 1) {
      // Should be different generators if we have multiple shards
      assert.ok(gen1 !== gen2);
    }

    // After cycling through all generators, should return to first
    for (var i = 2; i < shards.size; i++) {
      shards.next();
    }
    var genAfterCycle = shards.next();
    assert.strictEqual(genAfterCycle, gen1);
  });

test('should generate unique IDs across different shards', function () {
    var shards = new muid.ShardedGenerators();
    var ids = [];
    var count = 50; // Reduced for Espruino performance

    for (var i = 0; i < count; i++) {
      var gen = shards.next();
      var id = gen.id().value;

      // Check for duplicates
      for (var j = 0; j < ids.length; j++) {
        assert.ok(!values64Equal(id, ids[j]), 'Generated duplicate ID across shards');
      }
      ids.push(id);
    }

    assert.strictEqual(ids.length, count);
  });

test('should generate unique MUIDs', function () {
    var id1 = muid.make();
    var id2 = muid.make();

    assert.ok(id1 instanceof muid.MUID);
    assert.ok(id2 instanceof muid.MUID);
    assert.ok(!values64Equal(id1.value, id2.value));
  });

test('should generate monotonic IDs', function () {
    var ids = [];
    for (var i = 0; i < 20; i++) { // Reduced for Espruino performance
      ids.push(muid.make().value);
    }

    for (var i = 1; i < ids.length; i++) {
      assert.ok(muid.cmp64(ids[i], ids[i - 1]) > 0);
    }
  });

test('should create generator with custom config', function () {
    var customConfig = {
      machineID: muid.from32(999),
      timestampBitLen: 40,
      machineIDBitLen: 12,
      epoch: muid.make64(Math.floor(1600000000000 / 0x100000000), 1600000000000 & 0xFFFFFFFF)
    };

    var generator = muid.newGenerator(customConfig);
    assert.ok(values64Equal(generator.machineID, muid.from32(999)));
    assert.strictEqual(generator.timestampBitLen, 40);
    assert.strictEqual(generator.machineIDBitLen, 12);
  });

test('should merge with default config', function () {
    var partialConfig = {
      machineID: muid.from32(777)
    };

    var generator = muid.newGenerator(partialConfig);
    assert.ok(values64Equal(generator.machineID, muid.from32(777)));
    assert.strictEqual(generator.timestampBitLen, 41); // Default
    assert.strictEqual(generator.machineIDBitLen, 14); // Default
  });

test('should correctly calculate bit shifts and masks', function () {
    var config = {
      machineID: muid.from32(123),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 5, 3); // shard index 5, 3 shard bits

    assert.strictEqual(generator.counterBitLen, 64 - 41 - 14 - 3); // 6 bits
    assert.strictEqual(generator.timestampBitShift, 14 + 3 + 6); // 23
    assert.strictEqual(generator.machineIDShift, 3 + 6); // 9
    assert.strictEqual(generator.shardIndexShift, 6);
  });

test('should correctly embed components in MUID', function () {
    var config = {
      machineID: muid.from32(0xABC),
      timestampBitLen: 40,
      machineIDBitLen: 12,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0x7, 4); // shard index 7, 4 shard bits

    var id = generator.id();
    var value = id.value;

    // Extract components and verify
    var counterBits = 64 - 40 - 12 - 4; // 8 bits
    var counterMask = muid.sub64(muid.shl64(muid.from32(1), counterBits), muid.from32(1));
    var counter = muid.and64(value, counterMask);

    var shardMask = muid.sub64(muid.shl64(muid.from32(1), 4), muid.from32(1));
    var shardIndex = muid.and64(muid.shr64(value, counterBits), shardMask);

    var machineIDMask = muid.sub64(muid.shl64(muid.from32(1), 12), muid.from32(1));
    var machineID = muid.and64(muid.shr64(value, counterBits + 4), machineIDMask);

    assert.strictEqual(shardIndex.low, 0x7);
    assert.strictEqual(machineID.low, 0xABC);
    assert.ok(muid.cmp64(counter, muid.from32(0)) > 0);
  });

test('should handle minimum values', function () {
    var config = {
      machineID: muid.from32(0),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.from32(Date.now() & 0xFFFFFFFF) // Current time as epoch
    };
    var generator = new muid.Generator(config, 0, 0);

    var id = generator.id();
    assert.ok(muid.cmp64(id.value, muid.from32(0)) > 0);
  });

test('should handle maximum machine ID', function () {
    var maxMachineID = (1 << 14) - 1; // 14 bits all set
    var config = {
      machineID: muid.from32(maxMachineID),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    var id = generator.id();
    assert.ok(muid.cmp64(id.value, muid.from32(0)) > 0);
    assert.strictEqual(generator.machineID.low, maxMachineID);
  });

test('should handle very large machine ID input', function () {
    var hugeMachineID = 0xFFFFFFFF; // Larger than 14 bits
    var config = {
      machineID: muid.from32(hugeMachineID),
      timestampBitLen: 41,
      machineIDBitLen: 14,
      epoch: muid.make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF)
    };
    var generator = new muid.Generator(config, 0, 0);

    // Should be masked to 14 bits
    var expected = hugeMachineID & ((1 << 14) - 1);
    assert.strictEqual(generator.machineID.low, expected);
  });

    test('should generate many unique IDs quickly', function () {
    var generator = muid.newGenerator();
    var count = 1000; // Reduced for Espruino performance
    var ids = [];

    var start = Date.now();
    for (var i = 0; i < count; i++) {
      ids.push(generator.id().value);
    }
    var end = Date.now();

    // Check uniqueness
    for (var i = 0; i < ids.length; i++) {
      for (var j = i + 1; j < ids.length; j++) {
        assert.ok(!values64Equal(ids[i], ids[j]), 'All IDs should be unique');
      }
    }

    console.log('    Generated ' + count + ' IDs in ' + (end - start) + 'ms');
  });

test('should maintain monotonicity under stress', function () {
    var generator = muid.newGenerator();
    var lastId = muid.from32(0);

    for (var i = 0; i < 100; i++) { // Reduced for Espruino performance
      var id = generator.id().value;
      assert.ok(muid.cmp64(id, lastId) > 0, 'ID should be greater than previous at iteration ' + i);
      lastId = id;
    }
  });
