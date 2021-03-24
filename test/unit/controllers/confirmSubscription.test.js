const config = require('./../../../config')

const mockHelpers = require('./../../helpers')

let req
let res
let next

const mockEncryptedData = 'YqzGG8EeqlzwyZ9qgYCXzFsg5+iS0Ht8Rr79'
const mockConfirmData = {
  subscriberEmailAddress: 'john.doe@example.com',
  parent: 'an-awesome-post-about-staticman',
  parentName: 'An Awesome Post About Staticman',
  subscribeConsentDate: 1607380281,
  subscribeConsentUrl: 'mock subscribe consent url',
  subscribeConsentContext: 'mock subscribe consent context',
  subscribeConsentText: 'mock subscribe consent text',
  subscribeConfirmContext: 'Email "Mock subscription confirmation for Test blog"',
  subscribeConfirmText: 'Mock confirm text!',
  subscribeConfirmRedirect: 'https://example.com/redirect',
  subscribeConfirmRedirectError: 'https://example.com/redirectError',
  pepper: 'mock crypto pepper',
  exeEnv: 'staging'
}

let mockDecryptFunc = jest.fn()
jest.mock('./../../../lib/RSA', () => {
  return {
    decrypt: mockDecryptFunc
  }
})

let mockSendResponseFn = jest.fn()
// The sendResponse module exposes one "naked" function.
jest.mock('../../../controllers/sendResponse', () => {
  return mockSendResponseFn
})

let mockSetConfigPathFn = jest.fn()
let mockCreateSubscriptionFn = jest.fn()
jest.mock('../../../lib/Staticman', () => {
  return jest.fn().mockImplementation(() => {
    return {
      setConfigPath: mockSetConfigPathFn,
      createSubscription: mockCreateSubscriptionFn
    }
  })
})

// Instantiate the module being tested AFTER mocking dependendent modules above.
const confirmSubscription = require('../../../controllers/confirmSubscription')

beforeEach(() => {
  req = mockHelpers.getMockRequest()
  req.query = {
  	data: mockEncryptedData
  }

  res = mockHelpers.getMockResponse()

  mockDecryptFunc.mockImplementation((encryptedDataStr) => {
  	return JSON.stringify(mockConfirmData)
  })

  config.set('cryptoPepper', mockConfirmData.pepper)
  config.set('exeEnv', mockConfirmData.exeEnv)
})

afterEach(() => {
  mockDecryptFunc.mockClear()
  mockSendResponseFn.mockClear()
  mockSetConfigPathFn.mockClear()
  mockCreateSubscriptionFn.mockClear()
})

describe('confirmSubscription', () => {
  test('abort and return error if confirm data not supplied', () => {
  	mockDecryptFunc.mockImplementation((encryptedDataStr) => null)

	// Suppress any calls to console.error - to keep test output clean.
	const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    expect.hasAssertions()
    return confirmSubscription(req, res, next).then(() => {
      expect(mockDecryptFunc.mock.calls[0][0]).toEqual(mockEncryptedData)
      expect(mockCreateSubscriptionFn).toHaveBeenCalledTimes(0)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1]).toEqual({
      	err: new Error('Authenticity check failed.')
      })

	  // Restore console.error
	  consoleSpy.mockRestore()
    })
  })

  test('abort and return error if crypto pepper mismatch', () => {
  	config.set('cryptoPepper', mockConfirmData.pepper + ' different')

	// Suppress any calls to console.error - to keep test output clean.
	const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    expect.hasAssertions()
    return confirmSubscription(req, res, next).then(() => {
      expect(mockDecryptFunc.mock.calls[0][0]).toEqual(mockEncryptedData)
      expect(mockCreateSubscriptionFn).toHaveBeenCalledTimes(0)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1]).toEqual({
      	err: new Error('Authenticity check failed.'),
      	redirectError: mockConfirmData.subscribeConfirmRedirectError
      })

	  // Restore console.error
	  consoleSpy.mockRestore()
    })
  })

  test('abort and return error if create subscription fails', () => {
  	const mockError = 'mock error'
  	mockCreateSubscriptionFn.mockImplementation((confirmData) => Promise.reject( mockError ))

	// Suppress any calls to console.error - to keep test output clean.
	const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    expect.hasAssertions()
    return confirmSubscription(req, res, next).then(() => {
      expect(mockDecryptFunc.mock.calls[0][0]).toEqual(mockEncryptedData)
      expect(mockCreateSubscriptionFn).toHaveBeenCalledTimes(1)
      expect(mockCreateSubscriptionFn.mock.calls[0][0]).toEqual(mockConfirmData)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1]).toEqual({
      	err: mockError,
      	redirectError: mockConfirmData.subscribeConfirmRedirectError
      })

	  // Restore console.error
	  consoleSpy.mockRestore()
    })
  })

  test('return response if create subscription succeeds', () => {
  	mockCreateSubscriptionFn.mockImplementation((confirmData) => Promise.resolve( {} ))

    expect.hasAssertions()
    return confirmSubscription(req, res, next).then(() => {
      expect(mockDecryptFunc.mock.calls[0][0]).toEqual(mockEncryptedData)
      expect(mockCreateSubscriptionFn).toHaveBeenCalledTimes(1)
      expect(mockCreateSubscriptionFn.mock.calls[0][0]).toEqual(mockConfirmData)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1]).toEqual({
      	redirect: mockConfirmData.subscribeConfirmRedirect
      })
    })
  })

})
