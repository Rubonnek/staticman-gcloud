const md5 = require('md5')

const mockHelpers = require('./../../helpers')

const SubscriptionsManager = require('./../../../lib/SubscriptionsManager')

let params = {
	username: 'foo-user',
	repository: 'foo-repo'
}
const dataStore = null

let mockListsInfoFunc = jest.fn()
let mockListsCreateFunc = jest.fn()
let mockListsMembersCreateFunc = jest.fn()
let mockListsMembersListFunc = jest.fn()
let mockNotificationSendFunc = jest.fn()

jest.mock('./../../../lib/Notification', () => {
  return jest.fn(() => ({
    send: mockNotificationSendFunc
  }))
})

let mockMailAgent

let options
let fields
let extendedFields
let siteConfig
let listMembers
const emailAddr = 'foo@example.com'

beforeEach(() => {
  mockMailAgent = {
  	lists: jest.fn().mockImplementation(listaddr => {
  	  const result = {
    		info: mockListsInfoFunc,
    		create: mockListsCreateFunc,
    		members: jest.fn().mockImplementation(() => {
    		  const result = {
    			  create: mockListsMembersCreateFunc,
            list: mockListsMembersListFunc
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
  mockMailAgent.lists.mockClear()
  mockListsInfoFunc.mockClear()
  mockListsCreateFunc.mockClear()
  mockListsMembersCreateFunc.mockClear()
  mockListsMembersListFunc.mockClear()
  mockNotificationSendFunc.mockClear()
})

describe('SubscriptionsManager', () => {
  describe('set', () => {
    test('creates mailing list if it does not exist and adds subscriber', async () => {
      const subscriptionsMgr = new SubscriptionsManager(params, dataStore, mockMailAgent)

      // Mock that the list does not exist.
      mockListsInfoFunc.mockImplementation( (callback) => callback(null, null) )
      mockListsCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success') )
      mockListsMembersCreateFunc.mockImplementation( (createData, callback) => callback(null, 'success'))

      expect.hasAssertions()
      await subscriptionsMgr.set(options, emailAddr, siteConfig).then(response => {
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(3)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockMailAgent.lists.mock.calls[0][0]).toBe('26b053c67a70a1127b71783c3d39d355@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['address']).toBe('26b053c67a70a1127b71783c3d39d355@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['access_level']).toBe('readonly')
        expect(mockListsCreateFunc.mock.calls[0][0]['reply_preference']).toBe('sender')
        expect(mockListsMembersCreateFunc.mock.calls[0][0]).toEqual( { address: emailAddr } )
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(3)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockMailAgent.lists.mock.calls[0][0]).toBe('26b053c67a70a1127b71783c3d39d355@example.com')
        expect(mockListsCreateFunc.mock.calls[0][0]['address']).toBe('26b053c67a70a1127b71783c3d39d355@example.com')
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        // Assert that list not created.
        expect(mockListsCreateFunc).toHaveBeenCalledTimes(0)
        expect(mockListsMembersCreateFunc).toHaveBeenCalledTimes(1)
        expect(mockMailAgent.lists.mock.calls[0][0]).toBe('26b053c67a70a1127b71783c3d39d355@example.com')
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(1)
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(2)
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(3)
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(1)
        expect(mockMailAgent.lists.mock.calls[0][0]).toBe('26b053c67a70a1127b71783c3d39d355@example.com')
        expect(mockMailAgent.lists.mock.calls[1][0]).toBe('26b053c67a70a1127b71783c3d39d355@example.com')
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
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(1)
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(2)
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(2)
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
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(1)
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
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        // If the member list lookup fails, assume the commenter is not the only subscriber and send.
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(1)

        // Restore console.error
        consoleSpy.mockRestore();
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
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect.hasAssertions()
      await subscriptionsMgr.send(options.parent, fields, extendedFields, options, siteConfig).then(response => {
        expect(mockMailAgent.lists).toHaveBeenCalledTimes(2)
        expect(mockListsInfoFunc).toHaveBeenCalledTimes(1)
        expect(mockListsMembersListFunc).toHaveBeenCalledTimes(1)
        // If the member list processing fails, assume the commenter is not the only subscriber and send.
        expect(mockNotificationSendFunc).toHaveBeenCalledTimes(1)

        // Restore console.error
        consoleSpy.mockRestore();
      })
    })
  })
})