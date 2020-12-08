const config = require('./../../../config')
const mockHelpers = require('./../../helpers')

const recipient = 'john.doe@example.com'

let mockSubject
let mockContent
let mockSubjectError
let mockContentError
let mockData
let mockCryptoPepper = 'mock crypto pepper'

// Mock the readFile function within the native fs module, but leave every other function.
jest.mock('fs', () => {
  const fsOrig = require.requireActual('fs')
  return {
    ...fsOrig,
    readFile: (path, options, callback) => {
      // Only intercept requests for our subject and content templates.
      if (path.endsWith('email-confirmation-subject.njk')) {
        callback(mockSubjectError, mockSubject)
      } else if (path.endsWith('email-confirmation-content.njk')) {
        callback(mockContentError, mockContent)
      } else {
        return fsOrig.readFile(path, options, callback)
      }
    }
  }
})

let mockEncryptFunc = jest.fn()
jest.mock('./../../../lib/RSA', () => {
  return {
    encrypt: mockEncryptFunc
  }
})

const Confirmation = require('./../../../lib/Confirmation')

let mockMailAgent
let mockSendFunc = jest.fn()

beforeEach(() => {
  config.set('cryptoPepper', mockCryptoPepper)

  mockMailAgent = {
    messages: jest.fn().mockImplementation(() => {
      const result = {
        send: mockSendFunc
      }
      return result
    })
  }

  mockSubject = null
  mockContent = null
  mockSubjectError = null
  mockContentError = null

  mockData = {
    data: {
      siteName: 'Test blog'
    },
    fields: {
      name: 'Eduardo Bouças',
      email: 'mail@eduardoboucas.com'
    },
    extendedFields: {
      _id: '70c33c00-17b3-11eb-b910-2f4fc1bf5873'
    },
    options: {
      origin: 'https://eduardoboucas.com/an-awesome-post-about-staticman', 
      parent: 'an-awesome-post-about-staticman',
      parentName: 'An Awesome Post About Staticman',
      subscribeConfirmRedirect: 'mock subscribe confirm redirect',
      subscribeConfirmRedirectError: 'mock subscribe confirm redirect error',
      subscribeConsentUrl: 'mock subscribe consent url',
      subscribeConsentContext: 'mock subscribe consent context',
      subscribeConsentText: 'mock subscribe consent text'
    } 
  }
})

afterEach(() => {
  mockMailAgent.messages.mockClear()
  mockSendFunc.mockClear()
  mockEncryptFunc.mockClear()
})

describe('Confirmation interface', () => {
  describe('send', () => {
    test('sends confirmation email with customized subject and content', async () => {
      const confirmation = new Confirmation(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      mockSubject = 'Mock subscription confirmation for {{ data.siteName }}'
      mockContent = 'Mock subscription confirmation email explanation to receive notifications for {{ options.origin }}. ' + 
        '<!--confirmTextStart-->Mock confirm text!<!--confirmTextEnd-->'

      expect.hasAssertions()
      await confirmation.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('Mock subscription confirmation for ' + mockData.data.siteName)
        expect(mockSendFunc.mock.calls[0][0].html).toContain(
          'Mock subscription confirmation email explanation to receive notifications for ' + mockData.options.origin + '.')
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).pepper).toEqual(mockCryptoPepper)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscriberEmailAddress).toEqual(recipient)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).parent).toEqual(mockData.options.parent)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).parentName).toEqual(mockData.options.parentName)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmContext).toEqual(
          'Email "Mock subscription confirmation for ' + mockData.data.siteName + '"')
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmText).toEqual('Mock confirm text!')
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmRedirect).toEqual(mockData.options.subscribeConfirmRedirect)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmRedirectError).toEqual(mockData.options.subscribeConfirmRedirectError)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentDate).toBeDefined()
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentUrl).toEqual(mockData.options.subscribeConsentUrl)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentContext).toEqual(mockData.options.subscribeConsentContext)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentText).toEqual(mockData.options.subscribeConsentText)
      })
    })

    test('sends confirmation email with customized subject and content, use consent data overrides/defaults', async () => {
      const confirmation = new Confirmation(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      mockSubject = 'Mock subscription confirmation for {{ data.siteName }}'
      mockContent = 'Mock subscription confirmation email explanation to receive notifications for {{ options.origin }}. ' + 
        '<!--confirmTextStart-->Mock confirm text!<!--confirmTextEnd-->'

      mockData.options.subscribeConsentDate = 'supplied consent date'
      delete mockData.options.subscribeConsentUrl
      delete mockData.options.subscribeConsentContext

      expect.hasAssertions()
      await confirmation.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('Mock subscription confirmation for ' + mockData.data.siteName)
        expect(mockSendFunc.mock.calls[0][0].html).toContain(
          'Mock subscription confirmation email explanation to receive notifications for ' + mockData.options.origin + '.')
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).pepper).toEqual(mockCryptoPepper)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscriberEmailAddress).toEqual(recipient)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).parent).toEqual(mockData.options.parent)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).parentName).toEqual(mockData.options.parentName)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmContext).toEqual(
          'Email "Mock subscription confirmation for ' + mockData.data.siteName + '"')
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmText).toEqual('Mock confirm text!')
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmRedirect).toEqual(mockData.options.subscribeConfirmRedirect)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConfirmRedirectError).toEqual(mockData.options.subscribeConfirmRedirectError)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentDate).toEqual(mockData.options.subscribeConsentDate)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentUrl).toEqual(mockData.options.origin)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentContext).toEqual(mockData.options.parentName)
        expect(JSON.parse(mockEncryptFunc.mock.calls[0][0]).subscribeConsentText).toEqual(mockData.options.subscribeConsentText)
      })
    })

    test('sends confirmation email with default subject and content if error raised reading templates', async () => {
      const confirmation = new Confirmation(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      // Force errors when trying to read the subject and content templates.
      mockSubjectError = 'subject readFile error'
      mockContentError = 'content readFile error'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await confirmation.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        // Expect that the default email subject will be used.
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('Please confirm your subscription to ' + mockData.data.siteName)
        // Expect that the default email content will be used.
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'You have requested to be notified every time a new comment is added to <a href="' + mockData.options.origin + '">' + 
          mockData.options.origin + '</a>.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          '<!--confirmTextStart-->Please confirm your subscription request by clicking this link:<!--confirmTextEnd-->')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('sends confirmation email with default subject and content if templates empty', async () => {
      const confirmation = new Confirmation(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      // Force empty templates.
      mockSubject = '    '
      mockContent = ' '

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await confirmation.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        // Expect that the default email subject will be used.
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('Please confirm your subscription to ' + mockData.data.siteName)
        // Expect that the default email content will be used.
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'You have requested to be notified every time a new comment is added to <a href="' + mockData.options.origin + '">' + 
          mockData.options.origin + '</a>.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          '<!--confirmTextStart-->Please confirm your subscription request by clicking this link:<!--confirmTextEnd-->')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('sends confirmation email with default subject and content if templates render to empty', async () => {
      const confirmation = new Confirmation(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      // Force contents of rendered templates to be empty.
      mockSubject = '  {{ options.foo }}     '
      mockContent = ' {{ fields.bar }} {{ fields.baz }}'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await confirmation.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        // Expect that the default email subject will be used.
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('Please confirm your subscription to ' + mockData.data.siteName)
        // Expect that the default email content will be used.
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'You have requested to be notified every time a new comment is added to <a href="' + mockData.options.origin + '">' + 
          mockData.options.origin + '</a>.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          '<!--confirmTextStart-->Please confirm your subscription request by clicking this link:<!--confirmTextEnd-->')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('send error handled', async () => {
      const confirmation = new Confirmation(mockMailAgent)
      
      // Mock that the message send errors.
      mockSendFunc.mockImplementation( (payload, callback) => callback(
        {statusCode: 500, message: 'message send failure'}, null) )

      mockSubject = 'Test subject'
      mockContent = 'Test content'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await confirmation.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).catch(error => {
        expect(error.message).toBe('message send failure')

        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        expect(mockSendFunc.mock.calls[0][0].subject).toBe(mockSubject)
        expect(mockSendFunc.mock.calls[0][0].html).toBe(mockContent)
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })
  })
})
