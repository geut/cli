'use strict'

require('../lib/fs-promises')
const { test } = require('tap')
const match = require('stream-match')
const { createEnv } = require('./util')
const P2PCommons = require('@p2pcommons/sdk-js')

test('edit', async t => {
  const { spawn, env } = createEnv()

  const p2p = new P2PCommons({
    baseDir: env,
    disableSwarm: true
  })
  await p2p.ready()
  await p2p.init({ type: 'content', title: 't', main: 'file.txt' })
  await p2p.destroy()

  const ps = spawn('edit')
  await match(ps.stdout, 'Select writable module')
  ps.kill()
})

test('no modules', async t => {
  const { exec } = createEnv()
  let threw = false
  try {
    await exec('edit')
  } catch (err) {
    threw = true
    t.match(err.message, /No modules/)
  }
  t.ok(threw)
})
