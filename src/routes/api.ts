import * as express from 'express'
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid'
import { store } from '../lib/database'
import * as access from '../lib/access'
import * as integrations from '../lib/database/integrations'
import { PizzlyError } from '../lib/error-handling'
import { refreshAuthentication } from '../lib/oauth'
import { Types } from '../types'

const api = express.Router()

api.use(bodyParser.urlencoded({ extended: false }))
api.use(bodyParser.json({ limit: '5mb' }))

/**
 * API authentication middleware.
 *
 * Authenticate requests to the API using a secret key.
 * This requires that you've previously secured your Pizzly's instance.
 * Learn more at https://github.com/Bearer/Pizzly/wiki/Secure
 */

api.use('*', access.secretKey)

/**
 * API test endpoint:
 */

api.get('/', (_req, res) => {
  return res.status(200).json({
    message: 'Successfully connected to the Pizzly API.'
  })
})

/**
 * Retrieves an integration configuration
 */

api.get('/:integrationId', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  return res.status(200).json({
    ...integration,
    id: integrationId,
    object: 'integration'
  })
})

/**
 * Authentications endpoint:
 *
 * - POST /:integration/authentications
 * - GET /:integration/authentications/:authId
 * - PUT /:integration/authentications/:authId
 * - DELETE /:integration/authentications/:authId
 */

/**
 * Saves a new authentication
 * (the authId will be generated by Pizzly)
 */

api.post('/:integrationId/authentications', async (req, res, next) => {
  const integrationId = req.params.integrationId

  // Make sure the integration exists
  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  // Validate the body
  const setupId = req.body.setup_id
  const payload = req.body.payload

  if (!setupId || typeof setupId !== 'string') {
    next(new PizzlyError('missing_setup_id'))
    return
  }

  if (!payload || typeof payload !== 'object') {
    next(new PizzlyError('missing_oauth_payload'))
    return
  }

  if (!isOAuthPayload(payload)) {
    next(new PizzlyError('invalid_oauth_payload'))
    return
  }

  // Validate the setupId
  const configuration = await store('configurations')
    .select('buid')
    .where({ buid: integrationId, setup_id: setupId })
    .first()

  if (!configuration) {
    next(new PizzlyError('unknown_configuration'))
    return
  }

  // Generate a new authentication
  const authId = uuidv4()
  const now = new Date().toISOString()

  const authentication: Types.Authentication = {
    object: 'authentication',
    id: authId,
    auth_id: authId,
    setup_id: setupId,
    payload,
    created_at: now,
    updated_at: now
  }

  await store('authentications').insert({
    buid: integrationId,
    auth_id: authId,
    setup_id: setupId,
    payload
  })

  res.status(201).json({
    message: 'Authentication created',
    authentication
  })
})

/**
 * Retrieves an authentication (including OAuth payload).
 */

api.get('/:integrationId/authentications/:authId', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const authId = req.params.authId

  const authenticationInStore = await store('authentications')
    .select('auth_id', 'setup_id', 'payload', 'created_at', 'updated_at')
    .where({ buid: integrationId, auth_id: authId })
    .first()

  if (!authenticationInStore) {
    next(new PizzlyError('unknown_authentication'))
    return
  }

  const authentication: Types.Authentication = {
    object: 'authentication',
    id: authenticationInStore.auth_id,
    auth_id: authenticationInStore.auth_id,
    setup_id: authenticationInStore.setup_id,
    payload: authenticationInStore.payload,
    created_at: authenticationInStore.created_at,
    updated_at: authenticationInStore.updated_at
  }

  res.status(200).json(authentication)
})

/**
 * Set or update an authentication
 */

api.put('/:integrationId/authentications/:authId', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const authId = req.params.authId

  // Make sure the integration exists
  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  // Validate the body
  const setupId = req.body.setup_id
  const payload = req.body.payload

  if (!setupId || typeof setupId !== 'string') {
    next(new PizzlyError('missing_setup_id'))
    return
  }

  if (!payload || typeof payload !== 'object') {
    next(new PizzlyError('missing_oauth_payload'))
    return
  }

  if (!isOAuthPayload(payload)) {
    next(new PizzlyError('invalid_oauth_payload'))
    return
  }

  // Validate the setupId
  const configuration = await store('configurations')
    .select('buid')
    .where({ buid: integrationId, setup_id: setupId })
    .first()

  if (!configuration) {
    next(new PizzlyError('unknown_configuration'))
    return
  }

  let createdAt: string

  // Fetch the authentication in database
  const oldAuthentication = await store('authentications')
    .select('buid')
    .where({ buid: integrationId, auth_id: req.body.auth_id })
    .first()

  // If it exists, update it
  if (oldAuthentication) {
    await store('authentications')
      .update({
        buid: integrationId,
        auth_id: authId,
        setup_id: setupId,
        payload
      })
      .where({ buid: integrationId, auth_id: authId })
      .limit(1)

    createdAt = oldAuthentication.created_at
  }

  // Otherwise, create a new one with the provided authId
  else {
    await store('authentications').insert({
      buid: integrationId,
      auth_id: authId,
      setup_id: setupId,
      payload
    })

    createdAt = new Date().toISOString()
  }

  const authentication: Types.Authentication = {
    object: 'authentication',
    id: authId,
    auth_id: authId,
    setup_id: setupId,
    payload,
    created_at: createdAt,
    updated_at: new Date().toISOString()
  }

  res.status(200).json({
    message: 'Authentication saved',
    authentication
  })
})

/**
 * Refresh an authentication using the refresh token (if any)
 */

api.post('/:integrationId/authentications/:authId/refresh', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const authId = req.params.authId

  // Make sure the integration exists
  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  const authenticationInStore = await store('authentications')
    .select('auth_id', 'setup_id', 'payload', 'created_at', 'updated_at')
    .where({ buid: integrationId, auth_id: authId })
    .first()

  if (!authenticationInStore) {
    next(new PizzlyError('unknown_authentication'))
    return
  }

  const oldAuthentication: Types.Authentication = {
    object: 'authentication',
    id: authId,
    auth_id: authId,
    setup_id: authenticationInStore.setup_id,
    payload: authenticationInStore.payload,
    created_at: authenticationInStore.created_at,
    updated_at: authenticationInStore.updated_at
  }

  try {
    const authentication = await refreshAuthentication(integration, oldAuthentication)
    res.json({ message: 'Authentication refreshed', authentication })
  } catch (err) {
    if (err instanceof PizzlyError) {
      return next(err)
    }

    return next(new PizzlyError('token_refresh_failed'))
  }
})

/**
 * Delete an authentication by removing it from the database
 * (subsequent requests using the same authId will fail).
 */

api.delete('/:integrationId/authentications/:authId', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const authId = req.params.authId

  const affectedRows = await store('authentications')
    .where({ buid: integrationId, auth_id: authId })
    .del()

  if (!affectedRows) {
    next(new PizzlyError('unknown_authentication'))
    return
  }

  res.status(200).json({ message: 'Authentication removed' })
})

/**
 * Configurations endpoint:
 *
 * - POST /github/configurations
 * - GET /github/configurations/a1b2c3...
 * - PUT /github/configurations/a1b2c3...
 * - DELETE /github/configurations/a1b2c3...
 */

/**
 * Saves a new configuration
 */

api.post('/:integrationId/configurations', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  const userScopes = req.body.scopes || []

  if (!Array.isArray(userScopes)) {
    next(new PizzlyError('invalid_scopes'))
    return
  }

  const scopes: string[] = integrations.validateConfigurationScopes(userScopes.join('\n')) || []
  const credentials = integrations.validateConfigurationCredentials(req.body.credentials, integration)

  if (!credentials) {
    next(new PizzlyError('invalid_credentials'))
    return
  }

  const configurationId = uuidv4()
  const configuration: Types.Configuration = {
    id: configurationId,
    setup_id: configurationId,
    object: 'configuration',
    scopes,
    credentials
  }

  await store('configurations').insert({
    buid: integrationId,
    setup_id: configurationId,
    credentials,
    scopes
  })

  res.status(201).json({
    message: 'Configuration created',
    configuration
  })
})

/**
 * Retrieve a configuration
 */

api.get('/:integrationId/configurations/:configurationId', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const savedConfig = await store('configurations')
    .select('credentials', 'scopes', 'created_at', 'updated_at')
    .where({ buid: integrationId, setup_id: configurationId })
    .first()

  if (!savedConfig) {
    next(new PizzlyError('unknown_configuration'))
    return
  }

  const configuration: Types.Configuration = {
    id: configurationId,
    setup_id: configurationId,
    object: 'configuration',
    scopes: savedConfig.scopes,
    credentials: savedConfig.credentials
  }

  res.json(configuration)
})

/**
 * Delete a configuration
 */

api.delete('/:integrationId/configurations/:configurationId', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const affectedRows = await store('configurations')
    .where({ buid: integrationId, setup_id: configurationId })
    .del()

  if (!affectedRows) {
    next(new PizzlyError('unknown_configuration'))
    return
  }

  res.status(200).json({ message: 'Configuration removed' })
})

/**
 * Update a configuration
 */

api.put('/:integrationId/configurations/:configurationId', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  const userScopes = req.body.scopes || []

  if (!Array.isArray(userScopes)) {
    next(new PizzlyError('invalid_scopes'))
    return
  }

  const scopes: string[] = integrations.validateConfigurationScopes(userScopes.join('\n')) || []
  const credentials = integrations.validateConfigurationCredentials(req.body.credentials, integration)

  if (!credentials) {
    next(new PizzlyError('invalid_credentials'))
    return
  }

  const configuration: Types.Configuration = {
    id: configurationId,
    setup_id: configurationId,
    object: 'configuration',
    scopes,
    credentials
  }

  const affectedRows = await store('configurations')
    .where({ buid: integrationId, setup_id: configurationId })
    .update({
      credentials,
      scopes
    })

  if (!affectedRows) {
    next(new PizzlyError('unknown_configuration'))
    return
  }

  res.json({
    message: 'Configuration updated',
    configuration
  })
})

/**
 * Error handling (middleware)
 */

api.use((_req, res, _next) => {
  return res.status(404).json({ error: { type: 'missing', message: 'Ressource not found' } })
})

api.use((err, _req, res, _next) => {
  let status = 400
  let type = 'invalid'
  let message = 'Bad request'

  if (err.type && err.status && err.message) {
    status = err.status
    type = err.type
    message = err.message
  } else {
    console.error(err)
  }

  return res.status(status).json({ error: { type, message } })
})

/**
 * Export routes
 */

export { api }

/**
 * Helper function to test if a payload is well formated.
 * TODO - This should probably be enhanced
 */

function isOAuthPayload(payload: Types.OAuthPayload | any): boolean {
  if (!payload) {
    return false
  }

  if (!payload.accessToken || typeof payload.accessToken !== 'string') {
    return false
  }

  return true
}
