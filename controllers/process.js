'use strict'

const path = require('path')
const config = require(path.join(__dirname, '/../config'))
const errorHandler = require('../lib/ErrorHandler')
const reCaptcha = require('express-recaptcha')
const Staticman = require('../lib/Staticman')
const sendResponse = require('./sendResponse')
const universalAnalytics = require('universal-analytics')

function checkRecaptcha (staticman, req) {
  return new Promise((resolve, reject) => {
    staticman.getSiteConfig().then(siteConfig => {
      if (!siteConfig.get('reCaptcha.enabled')) {
        return resolve(false)
      }

      const reCaptchaOptions = req.body.options && req.body.options.reCaptcha

      if (!reCaptchaOptions || !reCaptchaOptions.siteKey || !reCaptchaOptions.secret) {
        return reject(errorHandler('RECAPTCHA_MISSING_CREDENTIALS'))
      }

      let decryptedSecret

      try {
        decryptedSecret = staticman.decrypt(reCaptchaOptions.secret)
      } catch (err) {
        return reject(errorHandler('RECAPTCHA_CONFIG_MISMATCH'))
      }

      if (
        reCaptchaOptions.siteKey !== siteConfig.get('reCaptcha.siteKey') ||
        decryptedSecret !== siteConfig.get('reCaptcha.secret')
      ) {
        return reject(errorHandler('RECAPTCHA_CONFIG_MISMATCH'))
      }

      reCaptcha.init(reCaptchaOptions.siteKey, decryptedSecret)
      reCaptcha.verify(req, err => {
        if (err) {
          return reject(errorHandler(err))
        }

        return resolve(true)
      })
    }).catch(err => reject(err))
  })
}

function createConfigObject (apiVersion, property) {
  let remoteConfig = {}

  if (apiVersion === '1') {
    remoteConfig.file = '_config.yml'
    remoteConfig.path = 'staticman'
  } else {
    remoteConfig.file = 'staticman.yml'
    remoteConfig.path = property || ''
  }

  return remoteConfig
}

function process (staticman, req, res) {
  const ua = config.get('analytics.uaTrackingId')
    ? universalAnalytics(config.get('analytics.uaTrackingId'))
    : null
  const fields = req.query.fields || req.body.fields
  const options = req.query.options || req.body.options || {}

  return staticman.processEntry(fields, options).then(data => {
    sendResponse(res, data)

    if (ua) {
      ua.event('Entries', 'New entry').send()
    }
  })
}

module.exports = async (req, res, next) => {
  const staticman = await new Staticman(req.params)

  staticman.setConfigPath()
  staticman.setIp(req.headers['x-forwarded-for'] || req.connection.remoteAddress)
  staticman.setUserAgent(req.headers['user-agent'])

  return checkRecaptcha(staticman, req)
    .then(usedRecaptcha => process(staticman, req, res))
    .catch(err => sendResponse(res, {
      err,
      redirect: req.body.options && req.body.options.redirect,
      redirectError: req.body.options && req.body.options.redirectError
    }))
}

module.exports.checkRecaptcha = checkRecaptcha
module.exports.createConfigObject = createConfigObject
module.exports.process = process
