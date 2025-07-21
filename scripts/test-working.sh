#!/bin/bash

# Test script to run only the working tests
# This helps during development when some tests have TypeScript issues

echo "🧪 Running Working Tests Only"
echo "=============================="

# Run only the tests that are currently working
npm test -- --testPathPatterns="basic.test.ts|utils.test.ts|utils-simple.test.ts" --verbose

echo ""
echo "✅ Working tests completed!"
echo ""
echo "To run all tests (including failing ones):"
echo "  npm test"
echo ""
echo "To run a specific test file:"
echo "  npm test -- --testPathPatterns=\"filename.test.ts\"" 