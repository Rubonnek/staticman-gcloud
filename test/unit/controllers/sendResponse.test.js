const { URL, URLSearchParams } = require('url')

const mockHelpers = require('./../../helpers')

let res

const mockRedirect = 'https://example.com/redirect'
const mockRedirectError = 'https://example.com/redirectError'

let mockGetErrorCodeFn = jest.fn()
let mockGetMessageFn = jest.fn()
jest.mock('../../../lib/ErrorHandler', () => {
  return {
    getInstance: () => {
      return {
        getErrorCode: mockGetErrorCodeFn,
        getMessage: mockGetMessageFn
      }
    }
  }
})

// Instantiate the module being tested AFTER mocking dependendent modules above.
const sendResponse = require('../../../controllers/sendResponse')

beforeEach(() => {
  res = mockHelpers.getMockResponse()
})

afterEach(() => {
  mockGetErrorCodeFn.mockClear()
  mockGetMessageFn.mockClear()
})

describe('Send response', () => {
  test('redirect to success if no error, redirect supplied', () => {
    const data = {
      redirect: mockRedirect
    }

    expect.hasAssertions()
    sendResponse(res, data)
    expect(res.redirect.mock.calls[0][0]).toEqual(new URL(mockRedirect).toString())
  })

  test('redirect to success if secondary errors only, redirect supplied', () => {
    const data = {
      redirect: mockRedirect,
      secondaryErrors: {
      	mockError: 'mock secondary error'
      }
    }

    expect.hasAssertions()
    sendResponse(res, data)
    expect(res.redirect.mock.calls[0][0]).toEqual(mockRedirect + '?mockError=mock+secondary+error')
  })

  test('redirect to error if error and redirect for error supplied', () => {
    const data = {
      redirectError: mockRedirectError,
      err: 'mock error'
    }

    expect.hasAssertions()
    sendResponse(res, data)
    expect(res.redirect.mock.calls[0][0]).toEqual(new URL(mockRedirectError).toString())
  })

  test('respond with error if error key supplied', () => {
    const data = {
      err: {
      	_smErrorCode: 'mock error key',
      	data: 'mock error data'
      }
    }

    const mockErrorCode = 'mock error code'
    const mockErrorMessage = 'mock error message'

    mockGetErrorCodeFn.mockImplementation((errorKey) => mockErrorCode)
    mockGetMessageFn.mockImplementation((errorKey) => mockErrorMessage)

    expect.hasAssertions()
    sendResponse(res, data)
    expect(mockGetErrorCodeFn).toHaveBeenCalledTimes(1)
    expect(mockGetMessageFn).toHaveBeenCalledTimes(1)
    expect(res.status.mock.calls[0][0]).toEqual(500)
    expect(res.send.mock.calls[0][0].success).toEqual(false)
    expect(res.send.mock.calls[0][0].message).toEqual(mockErrorMessage)
    expect(res.send.mock.calls[0][0].data).toBe(data.err.data)
    expect(res.send.mock.calls[0][0].rawError).toBe(data.err)
    expect(res.send.mock.calls[0][0].errorCode).toEqual(mockErrorCode)
  })

  test('respond with raw error if no error key supplied', () => {
    const data = {
      err: {
      	data: 'mock error data'
      }
    }

    expect.hasAssertions()
    sendResponse(res, data)
    expect(mockGetErrorCodeFn).toHaveBeenCalledTimes(0)
    expect(mockGetMessageFn).toHaveBeenCalledTimes(0)
    expect(res.status.mock.calls[0][0]).toEqual(500)
    expect(res.send.mock.calls[0][0].success).toEqual(false)
    expect(res.send.mock.calls[0][0].message).toBeUndefined()
    expect(res.send.mock.calls[0][0].data).toBeUndefined()
    expect(res.send.mock.calls[0][0].rawError).toBe(data.err.toString())
    expect(res.send.mock.calls[0][0].errorCode).toBeUndefined()
  })

  test('respond with success if no error supplied', () => {
    const data = {
      fields: {
      	comment: 'mock comment'
      },
      secondaryErrors: {
      	mockError: 'mock secondary error'
      }
    }

    expect.hasAssertions()
    sendResponse(res, data)
    expect(mockGetErrorCodeFn).toHaveBeenCalledTimes(0)
    expect(mockGetMessageFn).toHaveBeenCalledTimes(0)
    expect(res.status.mock.calls[0][0]).toEqual(200)
    expect(res.send.mock.calls[0][0].success).toEqual(true)
    expect(res.send.mock.calls[0][0].fields).toBe(data.fields)
    expect(res.send.mock.calls[0][0].secondaryErrors).toBe(data.secondaryErrors)
  })
})
