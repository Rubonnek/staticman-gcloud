const config = require('./../../../config')
const mockHelpers = require('./../../helpers')
const Notification = require('./../../../lib/Notification')

const recipient = 'john.doe@example.com'

let mockSubject
let mockContent
let mockSubjectError
let mockContentError
// Mock the readFile function within the native fs module, but leave every other function.
jest.mock('fs', () => {
  const fsOrig = require.requireActual('fs')
  return {
    ...fsOrig,
    readFile: (path, options, callback) => {
      // Only intercept requests for our subject and content templates.
      if (path.endsWith('email-notification-subject.njk')) {
        callback(mockSubjectError, mockSubject)
      } else if (path.endsWith('email-notification-content.njk')) {
        callback(mockContentError, mockContent)
      } else {
        return fsOrig.readFile(path, options, callback)
      }
    }
  }
})

let mockMailAgent
let mockSendFunc = jest.fn()

beforeEach(() => {
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
})

afterEach(() => {
  mockMailAgent.messages.mockClear()
  mockSendFunc.mockClear()
})

describe('Notification interface', () => {
  let mockData = {
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
      parent: 'an-awesome-post-about-staticman'
    } 
  }

  describe('send', () => {
    test('sends notification email with customized subject and content', async () => {
      const notification = new Notification(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      mockSubject = 'FYI - {{ options.origin }} has a new comment'
      mockContent = 'New comment by {{ fields.name }} on {{ data.siteName }} here - {{ options.origin }}#comment-{{ extendedFields._id }}.'

      expect.hasAssertions()
      await notification.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('FYI - ' + mockData.options.origin + ' has a new comment')
        expect(mockSendFunc.mock.calls[0][0].html).toBe(
          'New comment by ' + mockData.fields.name + ' on ' + mockData.data.siteName + ' here - ' + 
          mockData.options.origin + '#comment-' + mockData.extendedFields._id + '.')
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)
      })
    })

    test('sends notification email with default subject and content if error raised reading templates', async () => {
      const notification = new Notification(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      // Force errors when trying to read the subject and content templates.
      mockSubjectError = 'subject readFile error'
      mockContentError = 'content readFile error'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await notification.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        // Expect that the default email subject will be used.
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('There is a new comment at ' + mockData.data.siteName)
        // Expect that the default email content will be used.
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'There is a new comment at <a href="' + mockData.options.origin + '">' + mockData.options.origin + '</a>.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'If you prefer, you may <a href="%mailing_list_unsubscribe_url%">unsubscribe</a> from future emails.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('sends notification email with default subject and content if templates empty', async () => {
      const notification = new Notification(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      // Force empty templates.
      mockSubject = '    '
      mockContent = ' '

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await notification.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        // Expect that the default email subject will be used.
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('There is a new comment at ' + mockData.data.siteName)
        // Expect that the default email content will be used.
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'There is a new comment at <a href="' + mockData.options.origin + '">' + mockData.options.origin + '</a>.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'If you prefer, you may <a href="%mailing_list_unsubscribe_url%">unsubscribe</a> from future emails.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('sends notification email with default subject and content if templates render to empty', async () => {
      const notification = new Notification(mockMailAgent)
      
      mockSendFunc.mockImplementation( (payload, callback) => callback(null, 'success') )

      // Force contents of rendered templates to be empty.
      mockSubject = '  {{ options.foo }}     '
      mockContent = ' {{ fields.bar }} {{ fields.baz }}'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await notification.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).then(response => {
        expect(mockSendFunc).toHaveBeenCalledTimes(1)
        expect(mockSendFunc.mock.calls[0][0].from.includes(config.get('email.fromAddress'))).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].to).toBe(recipient)
        // Expect that the default email subject will be used.
        expect(mockSendFunc.mock.calls[0][0].subject).toBe('There is a new comment at ' + mockData.data.siteName)
        // Expect that the default email content will be used.
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'There is a new comment at <a href="' + mockData.options.origin + '">' + mockData.options.origin + '</a>.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0].html.includes(
          'If you prefer, you may <a href="%mailing_list_unsubscribe_url%">unsubscribe</a> from future emails.')).toBe(true)
        expect(mockSendFunc.mock.calls[0][0]['h:Reply-To']).toBe(mockSendFunc.mock.calls[0][0].from)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('send error handled', async () => {
      const notification = new Notification(mockMailAgent)
      
      // Mock that the message send errors.
      mockSendFunc.mockImplementation( (payload, callback) => callback(
        {statusCode: 500, message: 'message send failure'}, null) )

      mockSubject = 'Test subject'
      mockContent = 'Test content'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await notification.send(recipient, mockData.fields, mockData.extendedFields, mockData.options, mockData.data).catch(error => {
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
