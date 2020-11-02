'use strict'

const RSA = require('../lib/RSA')
const Staticman = require('../lib/Staticman')
const sendResponse = require('./sendResponse')

/**
 * Express handler for requests to confirm that a user wants to subscribe to notification emails
 * sent whenever new comments are added (to a post, parent comment, etc.).
 */
module.exports = async (req, res, next) => {
  /*
   * All of the data needed to process a subscription confirmation (aside from values contained in
   * the URL path such as repo, branch, etc.) will be passed in the "data" querystring value.
   */
  const encryptedDataStr = req.query.data

  let confirmData = null
  try {
    const decryptedDataStr = RSA.decrypt(encryptedDataStr)
    confirmData = JSON.parse(decryptedDataStr)

    const staticman = await new Staticman(req.params)
    staticman.setConfigPath()

    return staticman.createSubscription(confirmData).then(data => {
      sendResponse(res, {
        redirect: confirmData.subscribeConfirmRedirect
      })
    }).catch(error => {
      console.error(error.stack || error)
      sendResponse(res, {
        err: error,
        redirectError: confirmData.subscribeConfirmRedirectError
      })
    })
  } catch (error) {
    console.error(error.stack || error)
    sendResponse(res, {
      err: error,
      redirectError: confirmData.subscribeConfirmRedirectError
    })
  }
}
