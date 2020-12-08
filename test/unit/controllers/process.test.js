const { URL, URLSearchParams } = require('url')

const mockHelpers = require('./../../helpers')

let req
let res
let next

const mockRedirect = 'https://example.com/redirect'
const mockRedirectError = 'https://example.com/redirectError'
const mockUserAgent = 'Firefox'
const mockReCaptchaSiteKey = 'mock reCaptcha site key'
const mockReCaptchaSecret = 'mock reCaptcha secret'
const mockReCaptchaSecretDecrypted = 'mock reCaptcha secret decrypted'

let mockSetConfigPathFn = jest.fn()
let mockGetSiteConfigFn = jest.fn()
let mockSetIpFn = jest.fn()
let mockSetUserAgentFn = jest.fn()
let mockDecryptFn = jest.fn()
let mockProcessEntryFn = jest.fn()
jest.mock('../../../lib/Staticman', () => {
  return jest.fn().mockImplementation(() => {
    return {
      setConfigPath: mockSetConfigPathFn,
      getSiteConfig: mockGetSiteConfigFn,
      setIp: mockSetIpFn,
      setUserAgent: mockSetUserAgentFn,
      decrypt: mockDecryptFn,
      processEntry: mockProcessEntryFn
    }
  })
})

let mockSendResponseFn = jest.fn()
// The sendResponse module exposes one "naked" function.
jest.mock('../../../controllers/sendResponse', () => {
  return mockSendResponseFn
})

let mockErrorHandlerFn = jest.fn()
jest.mock('../../../lib/ErrorHandler', () => {
  return mockErrorHandlerFn
})
mockErrorHandlerFn.mockImplementation((errorStr) => new Error(errorStr))

let mockReCaptchaInitFn = jest.fn()
let mockReCaptchaVerifyFn = jest.fn()
jest.mock('express-recaptcha', () => {
  return {
    init: mockReCaptchaInitFn,
    verify: mockReCaptchaVerifyFn
  }
})

// Instantiate the module being tested AFTER mocking dependendent modules above.
const process = require('../../../controllers/process')

beforeEach(() => {
  req = mockHelpers.getMockRequest()
  req.headers['user-agent'] = mockUserAgent

  req.body = {
    options: {
      redirect: mockRedirect,
      redirectError: mockRedirectError
    }
  }
})

afterEach(() => {
  mockSetConfigPathFn.mockClear()
  mockGetSiteConfigFn.mockClear()
  mockSetIpFn.mockClear()
  mockSetUserAgentFn.mockClear()
  mockDecryptFn.mockClear()
  mockProcessEntryFn.mockClear()

  mockSendResponseFn.mockClear()

  mockErrorHandlerFn.mockClear()

  mockReCaptchaInitFn.mockClear()
  mockReCaptchaVerifyFn.mockClear()
})

describe('Process controller', () => {
  test('abort and return an error if reCaptcha enabled but reCaptcha credentials not supplied in request', () => {
    mockGetSiteConfigFn.mockImplementation(() => new Promise((resolve, reject) => resolve(new Map([
        ['reCaptcha.enabled', true]
      ])))
    )

    expect.hasAssertions()
    return process(req, res, next).then(() => {
      expect(mockDecryptFn).toHaveBeenCalledTimes(0)
      expect(mockErrorHandlerFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn.mock.calls[0][0]).toEqual('RECAPTCHA_MISSING_CREDENTIALS')
      expect(mockSendResponseFn).toHaveBeenCalledTimes(1)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1].err.message).toEqual('RECAPTCHA_MISSING_CREDENTIALS')
      expect(mockSendResponseFn.mock.calls[0][1].redirect).toEqual(mockRedirect)
      expect(mockSendResponseFn.mock.calls[0][1].redirectError).toEqual(mockRedirectError)
    })
  })

  test('abort and return an error if reCaptcha secret decryption fails', () => {
    mockGetSiteConfigFn.mockImplementation(() => new Promise((resolve, reject) => resolve(new Map([
        ['reCaptcha.enabled', true]
      ])))
    )

    req.body.options.reCaptcha = {
      siteKey: mockReCaptchaSiteKey, 
      secret: mockReCaptchaSecret
    }

    mockDecryptFn.mockImplementation(() => {
      throw new Error('mock decrypt error')
    })

    expect.hasAssertions()
    return process(req, res, next).then(() => {
      expect(mockDecryptFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn.mock.calls[0][0]).toEqual('RECAPTCHA_CONFIG_MISMATCH')
      expect(mockSendResponseFn).toHaveBeenCalledTimes(1)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1].err.message).toEqual('RECAPTCHA_CONFIG_MISMATCH')
      expect(mockSendResponseFn.mock.calls[0][1].redirect).toEqual(mockRedirect)
      expect(mockSendResponseFn.mock.calls[0][1].redirectError).toEqual(mockRedirectError)
    })
  })

  test('abort and return an error if reCaptcha site key supplied in request does not match config', () => {
    mockGetSiteConfigFn.mockImplementation(() => new Promise((resolve, reject) => resolve(new Map([
        ['reCaptcha.enabled', true],
        ['reCaptcha.siteKey', mockReCaptchaSiteKey]
      ])))
    )

    req.body.options.reCaptcha = {
      siteKey: mockReCaptchaSiteKey + ' different', 
      secret: mockReCaptchaSecret
    }

    expect.hasAssertions()
    return process(req, res, next).then(() => {
      expect(mockDecryptFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn.mock.calls[0][0]).toEqual('RECAPTCHA_CONFIG_MISMATCH')
      expect(mockSendResponseFn).toHaveBeenCalledTimes(1)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1].err.message).toEqual('RECAPTCHA_CONFIG_MISMATCH')
      expect(mockSendResponseFn.mock.calls[0][1].redirect).toEqual(mockRedirect)
      expect(mockSendResponseFn.mock.calls[0][1].redirectError).toEqual(mockRedirectError)
    })
  })

  test('abort and return an error if reCaptcha secret supplied in request does not match config', () => {
    const mockReCaptchaSecretDecryptedExpected = mockReCaptchaSecretDecrypted + ' different'
    mockGetSiteConfigFn.mockImplementation(() => new Promise((resolve, reject) => resolve(new Map([
        ['reCaptcha.enabled', true],
        ['reCaptcha.siteKey', mockReCaptchaSiteKey],
        ['reCaptcha.secret', mockReCaptchaSecretDecryptedExpected]
      ])))
    )

    req.body.options.reCaptcha = {
      siteKey: mockReCaptchaSiteKey, 
      secret: mockReCaptchaSecret
    }

    mockDecryptFn.mockImplementation(() => mockReCaptchaSecretDecrypted)

    expect.hasAssertions()
    return process(req, res, next).then(() => {
      expect(mockDecryptFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn.mock.calls[0][0]).toEqual('RECAPTCHA_CONFIG_MISMATCH')
      expect(mockSendResponseFn).toHaveBeenCalledTimes(1)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1].err.message).toEqual('RECAPTCHA_CONFIG_MISMATCH')
      expect(mockSendResponseFn.mock.calls[0][1].redirect).toEqual(mockRedirect)
      expect(mockSendResponseFn.mock.calls[0][1].redirectError).toEqual(mockRedirectError)
    })
  })

  test('abort and return an error if reCaptcha verification fails', () => {
    mockGetSiteConfigFn.mockImplementation(() => new Promise((resolve, reject) => resolve(new Map([
        ['reCaptcha.enabled', true],
        ['reCaptcha.siteKey', mockReCaptchaSiteKey],
        ['reCaptcha.secret', mockReCaptchaSecretDecrypted]
      ])))
    )

    req.body.options.reCaptcha = {
      siteKey: mockReCaptchaSiteKey, 
      secret: mockReCaptchaSecret
    }

    mockDecryptFn.mockImplementation(() => mockReCaptchaSecretDecrypted)

    const mockVerifyError = 'mock reCaptcha verify error'
    mockReCaptchaVerifyFn.mockImplementation((req, callback) => {
      callback(mockVerifyError)
    })

    expect.hasAssertions()
    return process(req, res, next).then(() => {
      expect(mockDecryptFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn.mock.calls[0][0]).toEqual(mockVerifyError)
      expect(mockSendResponseFn).toHaveBeenCalledTimes(1)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1].err.message).toEqual(mockVerifyError)
      expect(mockSendResponseFn.mock.calls[0][1].redirect).toEqual(mockRedirect)
      expect(mockSendResponseFn.mock.calls[0][1].redirectError).toEqual(mockRedirectError)
    })
  })

  test('entry processed if reCaptcha disabled', () => {
    mockGetSiteConfigFn.mockImplementation(() => new Promise((resolve, reject) => resolve(new Map([
        ['reCaptcha.enabled', false]
      ])))
    )

    req.query = {}
    req.body.fields = {
      comment: 'mock comment'
    }
    req.body.options = {
      parent: 'mock parent'
    }

    const mockProcessData = {
      fields: {}
    }
    mockProcessEntryFn.mockImplementation((fields, options) => new Promise((resolve, reject) => resolve(
      mockProcessData
    )))

    expect.hasAssertions()
    return process(req, res, next).then(() => {
      expect(mockSetIpFn.mock.calls[0][0]).toEqual(req.headers['x-forwarded-for'])
      expect(mockSetUserAgentFn.mock.calls[0][0]).toEqual(mockUserAgent)
      expect(mockDecryptFn).toHaveBeenCalledTimes(0)
      expect(mockErrorHandlerFn).toHaveBeenCalledTimes(0)
      expect(mockProcessEntryFn).toHaveBeenCalledTimes(1)
      expect(mockProcessEntryFn.mock.calls[0][0]).toBe(req.body.fields)
      expect(mockProcessEntryFn.mock.calls[0][1]).toBe(req.body.options)
      expect(mockSendResponseFn).toHaveBeenCalledTimes(1)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1]).toBe(mockProcessData)
    })
  })

  test('entry processed if reCaptcha verification succeeds', () => {
    mockGetSiteConfigFn.mockImplementation(() => new Promise((resolve, reject) => resolve(new Map([
        ['reCaptcha.enabled', true],
        ['reCaptcha.siteKey', mockReCaptchaSiteKey],
        ['reCaptcha.secret', mockReCaptchaSecretDecrypted]
      ])))
    )

    req.query = {}
    req.body.fields = {
      comment: 'mock comment'
    }
    req.body.options = {
      parent: 'mock parent'
    }
    req.body.options.reCaptcha = {
      siteKey: mockReCaptchaSiteKey, 
      secret: mockReCaptchaSecret
    }

    mockDecryptFn.mockImplementation(() => mockReCaptchaSecretDecrypted)

    mockReCaptchaVerifyFn.mockImplementation((req, callback) => {
      callback(null)
    })

    const mockProcessData = {
      fields: {}
    }
    mockProcessEntryFn.mockImplementation((fields, options) => new Promise((resolve, reject) => resolve(
      mockProcessData
    )))

    expect.hasAssertions()
    return process(req, res, next).then(() => {
      expect(mockSetIpFn.mock.calls[0][0]).toEqual(req.headers['x-forwarded-for'])
      expect(mockSetUserAgentFn.mock.calls[0][0]).toEqual(mockUserAgent)
      expect(mockDecryptFn).toHaveBeenCalledTimes(1)
      expect(mockErrorHandlerFn).toHaveBeenCalledTimes(0)
      expect(mockProcessEntryFn).toHaveBeenCalledTimes(1)
      expect(mockProcessEntryFn.mock.calls[0][0]).toBe(req.body.fields)
      expect(mockProcessEntryFn.mock.calls[0][1]).toBe(req.body.options)
      expect(mockSendResponseFn).toHaveBeenCalledTimes(1)
      expect(mockSendResponseFn.mock.calls[0][0]).toBe(res)
      expect(mockSendResponseFn.mock.calls[0][1]).toBe(mockProcessData)
    })
  })

})
