'use strict'

const path = require('path')

const config = require(path.join(__dirname, '/../config'))
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
    // If the encrypted string is spoofed, the JSON parse will return null.
    const decryptedDataStr = RSA.decrypt(encryptedDataStr)
    confirmData = JSON.parse(decryptedDataStr)

    /*
     * Verify the pepper we inserted in the encrypted payload when creating the confirmation email.
     * More info - https://en.wikipedia.org/wiki/Pepper_(cryptography)
     * We do this because the "encrypt" endpoint is currently exposed for anyone to hit. As such,
     * an attacker could easily create their own valid encrypted strings and subscribe whoever they
     * want. They'd be able to see the expected structure of the payload data simply by looking at
     * the source code.
     */
    if (confirmData === null || confirmData.pepper !== config.get('cryptoPepper')) {
      throw new Error('Authenticity check failed.')
    }

    if (confirmData === null || confirmData.exeEnv !== config.get('exeEnv')) {
      throw new Error('Environment check failed.')
    }

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
    let data = {
      err: error
    }
    if (confirmData !== null) {
      data.redirectError = confirmData.subscribeConfirmRedirectError
    }
    sendResponse(res, data)
  }
}
