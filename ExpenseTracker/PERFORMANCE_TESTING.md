# Performance Testing Guide

This document describes the performance testing suite for the Expense Tracker application.

## Overview

The performance testing suite validates that the app can handle:
- ✅ **10,000+ expenses** with smooth operations
- ✅ **Large CSV exports** (10k rows) in reasonable time
- ✅ **Biometric timeout accuracy** within 100ms tolerance
- ✅ **Memory efficiency** during intensive operations

## Test Suites

### 1. Large Dataset Performance (`largeDataset.test.ts`)

Tests app performance with 10,000 expenses across various operations.

**Key Scenarios:**
- **Data Loading**: Load 10k expenses in <500ms
- **Filtering**: Filter by category or date in <100ms
- **Sorting**: Sort 10k expenses in <200ms
- **Calculations**: Sum totals in <50ms, group by category in <100ms
- **Search**: Full-text search in <100ms
- **Pagination**: First/middle page in <250ms
- **Memory**: No memory leaks during repeated operations
- **Complete Workflow**: Filter + Sort + Paginate in <300ms

**Run:**
```bash
pnpm test src/__tests__/performance/largeDataset.test.ts
```

### 2. CSV Generation Performance (`csvGeneration.test.ts`)

Tests CSV export performance with various dataset sizes.

**Key Scenarios:**
- **10k Row Export**: Generate CSV in <1 second
- **Performance Consistency**: Benchmark across 5 iterations
- **Scalability**: Linear scaling from 1k to 10k rows
- **Format Validation**: Verify CSV structure with 10k rows
- **Special Characters**: Handle quotes/commas correctly
- **Memory Efficiency**: No memory leaks during repeated exports
- **Real-world Exports**: Year-end, monthly, category-filtered

**Run:**
```bash
pnpm test src/__tests__/performance/csvGeneration.test.ts
```

### 3. Biometric Timeout Accuracy (`biometricTimeout.test.ts`)

Tests the accuracy and consistency of the 5-minute biometric lock timeout.

**Key Scenarios:**
- **Timeout Accuracy**: 1s, 5s, 10s timeouts within 100ms tolerance
- **Timeout Logic**: Correctly calculate elapsed time
- **Boundary Testing**: 4:59 (no lock), 5:00 (lock), 5:01 (lock)
- **Consistency**: Multiple checks produce same result
- **Rapid Checks**: 100 successive checks remain consistent
- **Real-world Scenarios**: 30s background (no lock), 6min (lock)
- **Performance**: Timeout check in <1ms average
- **Date.now() Reliability**: Monotonically increasing timestamps

**Run:**
```bash
pnpm test src/__tests__/performance/biometricTimeout.test.ts
```

## Running Performance Tests

### Run All Performance Tests
```bash
pnpm test src/__tests__/performance/
```

### Run with Verbose Output
```bash
pnpm test src/__tests__/performance/ --verbose
```

### Run Specific Test Suite
```bash
# Large dataset tests
pnpm test largeDataset.test.ts

# CSV generation tests
pnpm test csvGeneration.test.ts

# Biometric timeout tests
pnpm test biometricTimeout.test.ts
```

### Run with Performance Metrics
```bash
# The tests automatically output performance metrics
pnpm test src/__tests__/performance/ --verbose 2>&1 | tee performance-report.txt
```

## Performance Thresholds

### Data Operations
| Operation | Threshold | Actual |
|-----------|-----------|--------|
| Load 10k expenses | <500ms | ✅ |
| Filter 10k expenses | <100ms | ✅ |
| Sort 10k expenses | <200ms | ✅ |
| Calculate total | <50ms | ✅ |
| Group by category | <100ms | ✅ |
| Search | <100ms | ✅ |
| Paginate | <250ms | ✅ |
| Complete workflow | <300ms | ✅ |

### CSV Export
| Dataset Size | Threshold | Actual |
|--------------|-----------|--------|
| 100 rows | <100ms | ✅ |
| 1,000 rows | <300ms | ✅ |
| 10,000 rows | <1000ms | ✅ |

### Biometric Timeout
| Metric | Threshold | Actual |
|--------|-----------|--------|
| Timeout accuracy | ±100ms | ✅ |
| Check performance | <1ms | ✅ |
| Consistency | 100% | ✅ |

### Memory
| Operation | Threshold | Actual |
|-----------|-----------|--------|
| Max memory delta | <10MB | ✅ |
| Memory leak prevention | 0 leaks | ✅ |

## Interpreting Results

### Success Criteria
✅ **PASS**: All tests pass within thresholds
⚠️ **WARNING**: Some tests approach threshold limits
❌ **FAIL**: Tests exceed thresholds

### Example Output
```
📊 Performance: Large Dataset (10k expenses)
  Data Loading Performance
    ⏱️  Load Time: 234.56ms
    💾 Memory Delta: 12.34 MB
    ✓ should load 10k expenses in under 500ms (235ms)

  Calculation Performance
    ⏱️  Calculation Time: 23.45ms
    💰 Total: $1,234,567.89
    ✓ should calculate total for 10k expenses in under 50ms (24ms)
```

## Performance Optimization Tips

### If Tests Are Slow

1. **Check System Resources**
   - Close unnecessary applications
   - Ensure adequate RAM (8GB+ recommended)
   - Check CPU usage

2. **Database Operations**
   - Ensure indexes are created
   - Use batch operations where possible
   - Avoid N+1 queries

3. **JavaScript Optimization**
   - Use efficient array methods (filter, map, reduce)
   - Avoid nested loops
   - Leverage built-in functions

4. **Memory Management**
   - Clear large arrays after use
   - Avoid creating unnecessary copies
   - Use pagination for large datasets

### If Memory Usage Is High

1. **Check for Leaks**
   - Run memory efficiency tests
   - Monitor repeated operations
   - Review object retention

2. **Optimize Data Structures**
   - Use appropriate data types
   - Clear references when done
   - Avoid global state accumulation

## Continuous Integration

### GitHub Actions Example
```yaml
name: Performance Tests

on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test src/__tests__/performance/ --verbose
```

## Benchmarking Guidelines

### When to Run Performance Tests

1. **Before Major Releases**
   - Validate no performance regression
   - Document baseline metrics

2. **After Performance Optimizations**
   - Verify improvements
   - Compare before/after metrics

3. **When Adding New Features**
   - Ensure new code meets thresholds
   - Check impact on existing operations

4. **Regular Cadence**
   - Monthly regression testing
   - Track trends over time

### Baseline Metrics

Establish baseline metrics on reference hardware:
- **CPU**: 4-core 2.5GHz+
- **RAM**: 8GB+
- **Node**: v22.x
- **OS**: Ubuntu 22.04 / macOS 12+ / Windows 11

## Troubleshooting

### Tests Failing Inconsistently

**Problem**: Tests pass sometimes, fail other times

**Solutions**:
1. Increase timeout thresholds slightly
2. Run tests on idle system
3. Check for background processes
4. Increase test iterations for averaging

### Memory Tests Unreliable

**Problem**: Memory measurements vary significantly

**Solutions**:
1. Force garbage collection between tests
2. Add delays between iterations
3. Use average of multiple runs
4. Consider platform differences

### Timeout Tests Inaccurate

**Problem**: Timeout measurements drift

**Solutions**:
1. Use `performance.now()` for high precision
2. Account for system timer resolution
3. Add tolerance margins
4. Test on consistent hardware

## Contact & Support

For performance-related questions or issues:
1. Review this documentation
2. Check existing test implementations
3. Run tests with `--verbose` flag
4. Compare with baseline metrics

---

**Last Updated**: 2025-01-29
**Test Suite Version**: 1.0.0
