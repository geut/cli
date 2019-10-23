#!/usr/bin/env node
'use strict'

process.title = 'hypergraph'

require('../lib/fs-promises')
const minimist = require('minimist')
const UserError = require('../lib/user-error')
const { version } = require('../package.json')
const hypergraph = require('..')

const help = `
  Usage
    $ hypergraph <action> <input>

  Actions
    create <type>              Create a module
    read   <hash> [key]        Read a module's metadata
    update <hash> [key value]  Update a module's metadata
    open   <hash>              Open a module's folder
    list   <type>              List writable modules

  Options
    --env, -e                  Dotfiles path (default ~/.p2pcommons)
    --help, -h                 Display help text
    --version, -v              Display version
    --title, -t                Module title
    --description, -d          Module description
  
  Module types
    - content                  A content module
    - profile                  A user profile module

  Examples
    $ hypergraph               [interactive mode]
`

const argv = minimist(process.argv.slice(2), {
  alias: {
    env: 'e',
    help: 'h',
    version: 'v',
    title: 't',
    description: 'd'
  }
})

if (argv.help) {
  console.log(help)
  process.exit(1)
}

if (argv.version) {
  console.log(version)
  process.exit(0)
}

hypergraph(argv).catch(err => {
  // istanbul ignore else
  if (err instanceof UserError) {
    if (err.message) console.error(err.message)
  } else {
    console.error(err)
  }

  process.exit(1)
})
