/**
 * Backend Connection Test Script
 * Run with: node test-backend.js
 */

const API_BASE_URL = 'http://16.171.146.239:3001/api/v1'

async function testEndpoint(name, url, method = 'GET', headers = {}) {
  console.log(`\n📡 Testing: ${name}`)
  console.log(`   URL: ${url}`)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })

    const data = await response.json()

    if (response.ok) {
      console.log(`   ✅ SUCCESS (${response.status})`)
      console.log(`   Response:`, JSON.stringify(data, null, 2))
    } else {
      console.log(`   ⚠️  ${response.status} ${response.statusText}`)
      console.log(`   Response:`, JSON.stringify(data, null, 2))
    }

    return { success: response.ok, data }
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function runTests() {
  console.log('═'.repeat(60))
  console.log('🔍 ADIYANTA BACKEND CONNECTION TEST')
  console.log('═'.repeat(60))
  console.log(`Base URL: ${API_BASE_URL}`)

  // Test 1: Config endpoint (public)
  await testEndpoint(
    'Get Config (Pricing & Free Downloads)',
    `${API_BASE_URL}/templates/config`
  )

  // Test 2: Templates list (public)
  await testEndpoint(
    'Get Templates List',
    `${API_BASE_URL}/templates?limit=5`
  )

  // Test 3: Auth endpoint
  await testEndpoint(
    'Auth Login Endpoint',
    `${API_BASE_URL}/auth/login`,
    'POST',
    {}
  )

  console.log('\n' + '═'.repeat(60))
  console.log('✨ Test Complete!')
  console.log('═'.repeat(60))
  console.log('\n📝 Notes:')
  console.log('   - Config endpoint should return pricing data')
  console.log('   - Templates endpoint should return template list')
  console.log('   - Auth endpoint expects phone number in body')
  console.log('\n💡 If all tests pass, backend connection is working!')
  console.log('\n⚠️  Make sure to restart your dev server after .env changes!')
  console.log('   Command: npm run dev\n')
}

runTests().catch(console.error)
