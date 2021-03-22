const md5 = require('md5')

const mockHelpers = require('./../../helpers')

let params = {
	username: 'foo-user',
	repository: 'foo-repo'
}
const dataStore = null

let mockNotificationSendFunc = jest.fn()
jest.mock('./../../../lib/Notification', () => {
  return jest.fn(() => ({
    send: mockNotificationSendFunc
  }))
})

let mockConfirmationSendFunc = jest.fn()
let mockBuildConsentDataFunc = jest.fn()
jest.mock('./../../../lib/Confirmation', () => {
  let result = jest.fn(() => ({
    send: mockConfirmationSendFunc
  }))
  // Allow for buildConsentData to be called as "static" method.
  result.buildConsentData = mockBuildConsentDataFunc
  return result
})

const SubscriptionsManager = require('./../../../lib/SubscriptionsManager')

let options
let fields
let extendedFields
let siteConfig
let listMembers
const emailAddr = 'foo@example.com'

let mockMailAgent

let mockListsFunc = jest.fn()
let mockListsInfoFunc = jest.fn()
let mockListsCreateFunc = jest.fn()
let mockListsMembersFunc = jest.fn()
let mockListsMembersCreateFunc = jest.fn()
let mockListsMembersListFunc = jest.fn()
let mockListsMembersInfoFunc = jest.fn()

beforeEach(() => {
  mockMailAgent = {
  	lists: mockListsFunc.mockImplementation(listaddr => {
  	  const result = {
    		info: mockListsInfoFunc,
    		create: mockListsCreateFunc,
    		members: mockListsMembersFunc.mockImplementation(() => {
    		  const result = {
    			  create: mockListsMembersCreateFunc,
            list: mockListsMembersListFunc,
            info: mockListsMembersInfoFunc
    		  }
    		  return result
    		})
  	  }
  	  return result
  	}), 
  	domain: 'example.com'
  }

  options = {
	  parent: 'an-awesome-post-about-staticman',
    origin: 'http://blog.example.com'
  }

  siteConfig = mockHelpers.getConfig()
})

afterEach(() => {
  mockNotificationSendFunc.mockClear()

  mockConfirmationSendFunc.mockClear()
  mockBuildConsentDataFunc.mockClear()

  mockListsFunc.mockClear()
  mockListsInfoFunc.mockClear()
  mockListsCreateFunc.mockClear()
  mockListsMembersFunc.mockClear()
  mockListsMembersCreateFunc.mockClear()
  mockListsMembersListFunc.mockClear()
  mockListsMembersInfoFunc.mockClear()
})

describe('SubscriptionsManager', () => {
  describe('set', () => {
    test('creates mailing list if it does not exist and adds subscriber, no consent model', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list does not exist.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      mockListsCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success') )
      mockListsMembersCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success'))

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(3)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['address']).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['access_level']).toBe('readonly')
        expect(mockListsCreateFunc.mock.calls[0][0]['reply_preference']).toBe('sender')
        expect(mockListsMembersCreateFunc.mock.calls[0][0]).toEqual( { address: emailAddr } )
      })
    })

    test('creates mailing list if it does not exist and adds subscriber, single consent model', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list does not exist.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      mockListsCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success') )
      mockListsMembersCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success'))

      siteConfig.set('notifications.consentModel', 'single')

      const mockConsentData = {
        subscribeConsentDate: Math.floor(new Date().getTime() / 1000)
      }
      mockBuildConsentDataFunc.mockImplementation( data => mockConsentData )

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(3)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['address']).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['access_level']).toBe('readonly')
        expect(mockListsCreateFunc.mock.calls[0][0]['reply_preference']).toBe('sender')
        expect(mockListsMembersCreateFunc.mock.calls[0][0].address).toEqual(emailAddr)
        expect(mockListsMembersCreateFunc.mock.calls[0][0].vars).toEqual(mockConsentData)
      })
    })

    test('creates mailing list if it does not exist and adds subscriber, double consent model', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list does not exist.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      mockListsCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success') )
      mockListsMembersCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success'))

      siteConfig.set('notifications.consentModel', 'double')

      const mockConsentData = {
        subscribeConsentDate: Math.floor(new Date().getTime() / 1000)
      }
      mockBuildConsentDataFunc.mockImplementation( data => mockConsentData )

      options.subscribeConfirmContext = 'mock subscribe confirm context'
      options.subscribeConfirmText = 'mock subscribe confirm text'

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(3)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['address']).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['access_level']).toBe('readonly')
        expect(mockListsCreateFunc.mock.calls[0][0]['reply_preference']).toBe('sender')
        expect(mockListsMembersCreateFunc.mock.calls[0][0].address).toEqual(emailAddr)
        expect(mockListsMembersCreateFunc.mock.calls[0][0].vars.subscribeConsentDate).toEqual(mockConsentData.subscribeConsentDate)
        expect(mockListsMembersCreateFunc.mock.calls[0][0].vars.subscribeConfirmDate).toBeDefined()
        expect(mockListsMembersCreateFunc.mock.calls[0][0].vars.subscribeConfirmContext).toEqual(options.subscribeConfirmContext)
        expect(mockListsMembersCreateFunc.mock.calls[0][0].vars.subscribeConfirmText).toEqual(options.subscribeConfirmText)
      })
    })

    test('creates mailing list (with name and description) if it does not exist and adds subscriber', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list does not exist.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      mockListsCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success') )
      mockListsMembersCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success'))

      // Set the optional parent name.
      options.parentName = 'Post an-awesome-post-about-staticman'

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(3)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['address']).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['access_level']).toBe('readonly')
        expect(mockListsCreateFunc.mock.calls[0][0]['reply_preference']).toBe('sender')
        // Assert that "name" and "description" are passed when parent name is supplied.
        expect(mockListsCreateFunc.mock.calls[0][0]['name']).toBe(options.parentName)
        expect(mockListsCreateFunc.mock.calls[0][0]['description']).toBe(
        	'Subscribers to ' + options.parent + ' (' + params.username + '/' + params.repository + ')')
        expect(mockListsMembersCreateFunc.mock.calls[0][0]).toEqual( { address: emailAddr } )
      })
    })

    test('does not create mailing list if it already exists and adds subscriber', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success'))

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        // Assert that list not created.
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(0)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsMembersCreateFunc.mock.calls[0][0]).toEqual( { address: emailAddr } )
      })
    })

    test('list lookup error handled', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list lookup errors.
      mockListsInfoFunc.mockImplementation( (callback) => 
        callback({statusCode: 500, message: 'list lookup failure'}, null) )

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).catch(error => {
        expect(error.message).toBe('list lookup failure')
        expect(mockListsFunc).toHaveBeenCalledTimes(1)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(0)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(0)
      })
    })

    test('list create error handled', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      // Mock that the list create errors.
      mockListsCreateFunc.mockImplementation( (createData, callback) => 
        callback({statusCode: 500, message: 'list create failure'}, null) )

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).catch(error => {
        expect(error.message).toBe('list create failure')
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(0)
      })
    })

    test('list member create error handled', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      mockListsCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success') )
      // Mock that the list member create errors.
      mockListsMembersCreateFunc.mockImplementation( (createData, callback) => 
        callback({statusCode: 500, message: 'member create failure'}, null) )

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).catch(error => {
        expect(error.message).toBe('member create failure')
        expect(mockListsFunc).toHaveBeenCalledTimes(3)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('send', () => {

    beforeEach(() => {
      listMembers = {
        items: [
          {
            address: 'bob@example.com',
            name: '',
            subscribed: true,
            vars: {}
          }, {
            address: 'jim@example.com',
            name: '',
            subscribed: true,
            vars: {}
          }
        ],
        total_count: 2
      }

      fields = mockHelpers.getFields()
      fields.email = md5('bob@example.com')

      extendedFields = {
        _id: '70c33c00-17b3-11eb-b910-2f4fc1bf5873'
      }
      extendedFields = Object.assign({}, fields)
    })

    test('sends notification email to mailing list', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersListFunc.mockImplementation( (callback) => callback(null, listMembers) )
      mockNotificationSendFunc.mockImplementation(() => Promise.resolve('success'))

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsFunc.mock.calls[1][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        // Verify important values instead of the entire objects. More robust.
        expect(mockNotificationSendFunc.mock.calls[0][1]['email']).toBe(fields.email)
        expect(mockNotificationSendFunc.mock.calls[0][2]['_id']).toBe(extendedFields._id)
        expect(mockNotificationSendFunc.mock.calls[0][3]['origin']).toBe(options.origin)
      })
    })

    test('sends no notification email if mailing list does not exist', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list does not exist.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).catch(error => {
        expect(error.message).toEqual(`Unable to find mailing list for ${options.parent}`)
        expect(mockListsFunc).toHaveBeenCalledTimes(1)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(0)
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(0)
      })
    })

    test('sends no notification email if commenter is the only subscriber', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Remove the list member who is NOT the commenter.
      listMembers.items.pop()
      listMembers.total_count = listMembers.items.length

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersListFunc.mockImplementation( (callback) => callback(null, listMembers) )
      mockNotificationSendFunc.mockImplementation(() => Promise.resolve('success'))

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(0)
      })
    })

    test('sends notification email if commenter is not the only subscriber', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Remove the list member who IS the commenter.
      listMembers.items.shift()
      listMembers.total_count = listMembers.items.length

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersListFunc.mockImplementation( (callback) => callback(null, listMembers) )
      mockNotificationSendFunc.mockImplementation(() => Promise.resolve('success'))

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(1)
      })
    })

    test('list lookup error handled', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list lookup errors.
      mockListsInfoFunc.mockImplementation( (callback) => 
        callback({statusCode: 500, message: 'list lookup failure'}, null) )

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).catch(error => {
        expect(error.message).toBe('list lookup failure')
        expect(mockListsFunc).toHaveBeenCalledTimes(1)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(0)
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(0)
      })
    })

    test('member list lookup error handled', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      // Mock that the member list lookup errors.
      mockListsMembersListFunc.mockImplementation( (callback) => 
        callback({statusCode: 500, message: 'member list lookup failure'}, null) )
      mockNotificationSendFunc.mockImplementation(() => Promise.resolve('success'))

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        // If the member list lookup fails, assume the commenter is not the only subscriber and send.
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(1)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('member list processing error handled', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Force a code execution error.
      listMembers = null

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersListFunc.mockImplementation( (callback) => callback(null, listMembers) )
      mockNotificationSendFunc.mockImplementation(() => Promise.resolve('success'))

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        // If the member list processing fails, assume the commenter is not the only subscriber and send.
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(1)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })
  })

  describe('sendConfirm', () => {

    beforeEach(() => {
      listMembers = {
        items: [
          {
            address: 'bob@example.com',
            name: '',
            subscribed: true,
            vars: {}
          }, {
            address: 'jim@example.com',
            name: '',
            subscribed: true,
            vars: {}
          }
        ],
        total_count: 2
      }

      fields = mockHelpers.getFields()
      fields.email = md5('bob@example.com')

      extendedFields = {
        _id: '70c33c00-17b3-11eb-b910-2f4fc1bf5873'
      }
      extendedFields = Object.assign({}, fields)
    })

    test('sends confirmation email to unsubscribed user', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersInfoFunc.mockImplementation( (callback) => callback(null, {member: {subscribed: false}}) )
      const mockSuccess = 'mock success'
      mockConfirmationSendFunc.mockImplementation(() => Promise.resolve(mockSuccess))

      const toEmailAddress = 'joe@example.com'

      expect.hasAssertions()
      await subscriptionsMgr.sendConfirm(toEmailAddress, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsFunc.mock.calls[1][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsMembersFunc.mock.calls[0][0]).toEqual(toEmailAddress)

        expect(mockConfirmationSendFunc).toHaveBeenCalledTimes(1)
        expect(mockConfirmationSendFunc.mock.calls[0][0]).toEqual(toEmailAddress)
        // Verify important values instead of the entire objects. More robust.
        expect(mockConfirmationSendFunc.mock.calls[0][1]['email']).toBe(fields.email)
        expect(mockConfirmationSendFunc.mock.calls[0][2]['_id']).toBe(extendedFields._id)
        expect(mockConfirmationSendFunc.mock.calls[0][3]['origin']).toBe(options.origin)
        expect(response).toEqual(mockSuccess)
      })
    })

    test('sends no confirmation email to already-subscribed user', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersInfoFunc.mockImplementation( (callback) => callback(null, {member: {subscribed: true}}) )

      const toEmailAddress = 'joe@example.com'

      expect.hasAssertions()
      await subscriptionsMgr.sendConfirm(toEmailAddress, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsFunc.mock.calls[1][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsMembersFunc.mock.calls[0][0]).toEqual(toEmailAddress)

        expect(mockConfirmationSendFunc).toHaveBeenCalledTimes(0)
        expect(response).toContain('Suppressing confirmation')
      })
    })

    test('sends confirmation email to user if mail agent error raised', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      mockListsMembersInfoFunc.mockImplementation( (callback) => callback(new Error('mock error'), null) )
      const mockSuccess = 'mock success'
      mockConfirmationSendFunc.mockImplementation(() => Promise.resolve(mockSuccess))

      const toEmailAddress = 'joe@example.com'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await subscriptionsMgr.sendConfirm(toEmailAddress, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsFunc.mock.calls[1][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsMembersFunc.mock.calls[0][0]).toEqual(toEmailAddress)

        expect(mockConfirmationSendFunc).toHaveBeenCalledTimes(1)
        expect(mockConfirmationSendFunc.mock.calls[0][0]).toEqual(toEmailAddress)
        // Verify important values instead of the entire objects. More robust.
        expect(mockConfirmationSendFunc.mock.calls[0][1]['email']).toBe(fields.email)
        expect(mockConfirmationSendFunc.mock.calls[0][2]['_id']).toBe(extendedFields._id)
        expect(mockConfirmationSendFunc.mock.calls[0][3]['origin']).toBe(options.origin)
        expect(response).toEqual(mockSuccess)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('sends confirmation email to user if mail agent result inspection error raised', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list exists.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, {list: {}}) )
      // Returning null is expected to raise an error from the calling code.
      mockListsMembersInfoFunc.mockImplementation( (callback) => callback(null, {}) )
      const mockSuccess = 'mock success'
      mockConfirmationSendFunc.mockImplementation(() => Promise.resolve(mockSuccess))

      const toEmailAddress = 'joe@example.com'

      // Suppress any calls to console.error - to keep test output clean.
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      expect.hasAssertions()
      await subscriptionsMgr.sendConfirm(toEmailAddress, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsFunc.mock.calls[1][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')
        expect(mockListsMembersFunc.mock.calls[0][0]).toEqual(toEmailAddress)

        expect(mockConfirmationSendFunc).toHaveBeenCalledTimes(1)
        expect(mockConfirmationSendFunc.mock.calls[0][0]).toEqual(toEmailAddress)
        // Verify important values instead of the entire objects. More robust.
        expect(mockConfirmationSendFunc.mock.calls[0][1]['email']).toBe(fields.email)
        expect(mockConfirmationSendFunc.mock.calls[0][2]['_id']).toBe(extendedFields._id)
        expect(mockConfirmationSendFunc.mock.calls[0][3]['origin']).toBe(options.origin)
        expect(response).toEqual(mockSuccess)

        // Restore console.error
        consoleSpy.mockRestore()
      })
    })

    test('sends confirmation email to user if mailing list does not exist', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list does not exist.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      const mockSuccess = 'mock success'
      mockConfirmationSendFunc.mockImplementation(() => Promise.resolve(mockSuccess))

      const toEmailAddress = 'joe@example.com'

      expect.hasAssertions()
      await subscriptionsMgr.sendConfirm(toEmailAddress, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockListsFunc).toHaveBeenCalledTimes(1)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersInfoFunc).toHaveBeenCalledTimes(0)
        expect(mockListsFunc.mock.calls[0][0]).toBe('65470423fb2a3199220eda8ce4385453@example.com')

        expect(mockConfirmationSendFunc).toHaveBeenCalledTimes(1)
        expect(mockConfirmationSendFunc.mock.calls[0][0]).toEqual(toEmailAddress)
        // Verify important values instead of the entire objects. More robust.
        expect(mockConfirmationSendFunc.mock.calls[0][1]['email']).toBe(fields.email)
        expect(mockConfirmationSendFunc.mock.calls[0][2]['_id']).toBe(extendedFields._id)
        expect(mockConfirmationSendFunc.mock.calls[0][3]['origin']).toBe(options.origin)
        expect(response).toEqual(mockSuccess)
      })

    })
  })

})