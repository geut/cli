'use strict'

require('./lib/fs-promises')
const { test } = require('tap')
const { spawn, exec } = require('child_process')
const match = require('stream-match')
const { promises: fs } = require('fs')
const { homedir, tmpdir } = require('os')
const { encode, decode } = require('dat-encoding')
const { promisify } = require('util')
const { version } = require('./package')

const cliSpawn = args =>
  spawn(`${__dirname}/bin/hypergraph.js`, args.split(' '))

const cliExec = args =>
  promisify(exec)(`${__dirname}/bin/hypergraph.js ${args}`)

const onExit = ps => new Promise(resolve => ps.on('exit', resolve))

test('--help', async t => {
  const ps = cliSpawn('--help')
  await match(ps.stdout, 'interactive mode')
  const code = await onExit(ps)
  t.equal(code, 1)
})

test('--version', async t => {
  const { stdout } = await cliExec('--version')
  t.ok(stdout.includes(version))
})

test('default', async t => {
  const ps = cliSpawn('')
  await match(ps.stdout, 'Create')
  ps.kill()
})

test('abort prompt', async t => {
  const ps = cliSpawn('')
  await match(ps.stdout, 'Create')
  ps.stdin.write('\x03') // Ctrl+C
  const code = await onExit(ps)
  t.equal(code, 1)
})

test('create', async t => {
  await t.test('create', async t => {
    await t.test('prompt', async t => {
      const ps = cliSpawn('create')
      await match(ps.stdout, 'Profile')
      ps.stdin.write('\n')
      await match(ps.stdout, 'Title')
      ps.stdin.write('title\n')
      await match(ps.stdout, 'Description')
      ps.stdin.write('description\n')
      await match(ps.stdout, 'License')
      ps.stdin.write('y')
      ps.stdin.end()
      const code = await onExit(ps)
      t.equal(code, 0)
    })

    await t.test('requires title', async t => {
      const ps = cliSpawn('create -y')
      await match(ps.stdout, 'Profile')
      ps.stdin.write('\n')
      await match(ps.stdout, 'Title')
      ps.stdin.write('\n')
      await match(ps.stdout, 'Title required')
      ps.stdin.write('title\n')
      await match(ps.stdout, 'Description')
      ps.stdin.write('description\n')
      const code = await onExit(ps)
      t.equal(code, 0)
    })

    await t.test('requires name', async t => {
      const ps = cliSpawn('create -y')
      await match(ps.stdout, 'Profile')
      ps.stdin.write(Buffer.from('1b5b42', 'hex')) // down arrow
      ps.stdin.write('\n')
      await match(ps.stdout, 'Name')
      ps.stdin.write('\n')
      await match(ps.stdout, 'Name required')
      ps.stdin.write('name\n')
      await match(ps.stdout, 'Description')
      ps.stdin.write('description\n')
      const code = await onExit(ps)
      t.equal(code, 0)
    })

    await t.test('requires license confirmation', async t => {
      const ps = cliSpawn('create')
      await match(ps.stdout, 'Profile')
      ps.stdin.write('\n')
      await match(ps.stdout, 'Title')
      ps.stdin.write('title\n')
      await match(ps.stdout, 'Description')
      ps.stdin.write('description\n')
      await match(ps.stdout, 'License')
      ps.stdin.write('\n')
      const code = await onExit(ps)
      t.equal(code, 1)
    })

    await t.test('license confirmation ca be skipped', async t => {
      const ps = cliSpawn('create -y')
      await match(ps.stdout, 'Profile')
      ps.stdin.write('\n')
      await match(ps.stdout, 'Title')
      ps.stdin.write('title\n')
      await match(ps.stdout, 'Description')
      ps.stdin.write('description\n')
      const code = await onExit(ps)
      t.equal(code, 0)
    })
  })

  await t.test('create content', async t => {
    const ps = cliSpawn('create content -y')
    await match(ps.stdout, 'Title')
    ps.stdin.write('title\n')
    await match(ps.stdout, 'Description')
    ps.stdin.write('description\n')
    const code = await onExit(ps)
    t.equal(code, 0)
  })

  await t.test('create profile', async t => {
    const ps = cliSpawn('create profile -y')
    await match(ps.stdout, 'Name')
    ps.stdin.write('name\n')
    await match(ps.stdout, 'Description')
    ps.stdin.write('description\n')
    const code = await onExit(ps)
    t.equal(code, 0)
  })

  await t.test('create <type> --title --description', async t => {
    await t.test('creates files', async t => {
      const { stdout } = await cliExec('create content --t=t --d=d -y')
      const hash = encode(stdout.trim())
      await fs.stat(`${homedir()}/.p2pcommons/${hash}`)
      await fs.stat(`${homedir()}/.p2pcommons/${hash}/dat.json`)
      await fs.stat(`${homedir()}/.p2pcommons/${hash}/.dat`)
    })

    await t.test('requires title', async t => {
      const ps = cliSpawn('create content --description=d -y')
      await match(ps.stdout, 'Title')
      ps.kill()
    })

    await t.test('requires name', async t => {
      const ps = cliSpawn('create profile --description=d -y')
      await match(ps.stdout, 'Name')
      ps.kill()
    })
  })

  await t.test('--env', async t => {
    await cliExec('create content -t=t -d=d -y')
    await fs.stat(`${homedir()}/.p2pcommons`)

    await cliExec(`create content -t=t -d=d -y --env=${tmpdir()}/.test`)
    await fs.stat(`${tmpdir()}/.test`)
  })
})

test('read', async t => {
  await t.test('read', async t => {
    await t.test('prompt', async t => {
      await cliExec('create content --title=t --description=d -y')
      await cliExec('create profile --name=n --description=d -y')

      const ps = cliSpawn('read')
      await match(ps.stdout, 'Select module')
      ps.stdin.write('\n')
      await match(ps.stdout, 'dat://')
      ps.stdin.end()
      const code = await onExit(ps)
      t.equal(code, 0)
    })

    await t.test('no modules', async t => {
      let threw = false
      try {
        await cliExec(`read --env=${tmpdir()}/${Math.random()}`)
      } catch (err) {
        threw = true
        t.match(err.message, /No modules/)
      }
      t.ok(threw)
    })
  })

  await t.test('read <hash>', async t => {
    let { stdout } = await cliExec('create content --t=t --d=d -y')
    const key = decode(stdout.trim())

    ;({ stdout } = await cliExec(`read ${encode(key)}`))
    const meta = JSON.parse(stdout)
    t.deepEqual(meta, {
      title: 't',
      description: 'd',
      url: `dat://${encode(key)}`,
      type: 'content',
      subtype: 'content',
      main: '',
      license: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
      authors: [],
      parents: []
    })
  })

  await t.test('read <hash> <key>', async t => {
    let { stdout } = await cliExec('create content --t=t --d=d -y')
    const hash = stdout.trim()

    ;({ stdout } = await cliExec(`read ${hash} title`))
    t.equal(stdout.trim(), '"t"')
  })
})

test('update', async t => {
  await t.test('update', async t => {
    await t.test('prompt', async t => {
      await cliExec('create content --title=t --description=d -y')
      await cliExec('create profile --name=n --description=d -y')

      const ps = await cliSpawn('update')
      await match(ps.stdout, 'Select module')
      ps.stdin.write('\n')
      await match(ps.stdout, 'Title')
      ps.stdin.write('\n') // keep value
      await match(ps.stdout, 'Description')
      ps.stdin.write('beep\n')
      const code = await onExit(ps)
      t.equal(code, 0)
    })

    await t.test('no modules', async t => {
      let threw = false
      try {
        await cliExec(`update --env=${tmpdir()}/${Math.random()}`)
      } catch (err) {
        threw = true
        t.match(err.message, /No modules/)
      }
      t.ok(threw)
    })
  })

  await t.test('update <hash>', async t => {
    let { stdout } = await cliExec('create content --t=t --d=d -y')
    const key = decode(stdout.trim())

    const ps = await cliSpawn(`update ${encode(key)}`)
    await match(ps.stdout, 'Title')
    ps.stdin.write('\n') // keep value
    await match(ps.stdout, 'Description')
    ps.stdin.write('beep\n')
    ;({ stdout } = await cliExec(`read ${encode(key)}`))
    const meta = JSON.parse(stdout)
    t.deepEqual(meta, {
      title: 't',
      description: 'beep',
      url: `dat://${encode(key)}`,
      type: 'content',
      subtype: 'content',
      main: '',
      license: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
      authors: [],
      parents: []
    })
  })

  await t.test('prompt main', async t => {
    let { stdout } = await cliExec('create content --t=t --d=d -y')
    const key = decode(stdout.trim())
    await fs.writeFile(`${homedir()}/.p2pcommons/${encode(key)}/file.txt`, 'hi')

    const ps = await cliSpawn(`update ${encode(key)}`)
    await match(ps.stdout, 'Title')
    ps.stdin.write('\n') // keep value
    await match(ps.stdout, 'Description')
    ps.stdin.write('beep\n')
    await match(ps.stdout, 'Main')
    await match(ps.stdout, 'file.txt')
    ps.stdin.write('\n')
    ps.stdin.end()
    const code = await onExit(ps)
    t.equal(code, 0)
    ;({ stdout } = await cliExec(`read ${encode(key)}`))
    const meta = JSON.parse(stdout)
    t.deepEqual(meta, {
      title: 't',
      description: 'beep',
      url: `dat://${encode(key)}`,
      type: 'content',
      subtype: 'content',
      main: 'file.txt',
      license: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
      authors: [],
      parents: []
    })
  })

  await t.test('update <hash> <key> <value>', async t => {
    await t.test('updates main', async t => {
      let { stdout } = await cliExec('create content --t=t --d=d -y')
      const key = decode(stdout.trim())

      await cliExec(`update ${encode(key)} main main`)
      ;({ stdout } = await cliExec(`read ${encode(key)}`))
      const meta = JSON.parse(stdout)
      t.deepEqual(meta, {
        title: 't',
        description: 'd',
        url: `dat://${encode(key)}`,
        type: 'content',
        subtype: 'content',
        main: 'main',
        license: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
        authors: [],
        parents: []
      })
    })

    await t.test('updates title', async t => {
      let { stdout } = await cliExec('create content --t=t --d=d -y')
      const key = decode(stdout.trim())

      await cliExec(`update ${encode(key)} title beep`)
      ;({ stdout } = await cliExec(`read ${encode(key)}`))
      const meta = JSON.parse(stdout)
      t.deepEqual(meta, {
        title: 'beep',
        description: 'd',
        url: `dat://${encode(key)}`,
        type: 'content',
        subtype: 'content',
        main: '',
        license: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
        authors: [],
        parents: []
      })
    })

    await t.test('invalid key', async t => {
      const { stdout } = await cliExec('create content --t=t --d=d -y')
      const key = decode(stdout.trim())

      let threw = false
      try {
        await cliExec(`update ${encode(key)} beep boop`)
      } catch (err) {
        t.ok(err.stderr.includes('update keys'))
        threw = true
      }
      t.ok(threw)
    })

    await t.test('clear value', async t => {
      let { stdout } = await cliExec('create content --t=t --d=d -y')
      const key = decode(stdout.trim())

      await cliExec(`update ${encode(key)} main`)
      ;({ stdout } = await cliExec(`read ${encode(key)}`))
      const meta = JSON.parse(stdout)
      t.deepEqual(meta, {
        title: 't',
        description: 'd',
        url: `dat://${encode(key)}`,
        type: 'content',
        subtype: 'content',
        main: '',
        license: 'https://creativecommons.org/publicdomain/zero/1.0/legalcode',
        authors: [],
        parents: []
      })
    })

    await t.test('requires title', async t => {
      const { stdout } = await cliExec('create content --t=t --d=d -y')
      const key = decode(stdout.trim())

      let threw = false
      try {
        await cliExec(`update ${encode(key)} title`)
      } catch (err) {
        threw = true
        t.match(err.message, /Title required/)
      }
      t.ok(threw)
    })

    await t.test('requires name', async t => {
      const { stdout } = await cliExec('create profile --n=n --d=d -y')
      const key = decode(stdout.trim())

      let threw = false
      try {
        await cliExec(`update ${encode(key)} name`)
      } catch (err) {
        threw = true
        t.match(err.message, /Name required/)
      }
      t.ok(threw)
    })
  })
})

test('open', async t => {
  const ps = cliSpawn('open')
  await match(ps.stdout, 'Hash')
  ps.kill()
})

test('path', async t => {
  // For this action the modules don't need to exist
  const hash =
    '41fac1c7ee0cde5b75ed2de9917a841b3c408dc04e0374a03cb610492f2c486f'

  await t.test('path', async t => {
    const ps = cliSpawn('path')
    await match(ps.stdout, 'Hash')
    ps.stdin.write(`${hash}\n`)
    await match(ps.stdout, `${homedir()}/.p2pcommons/${hash}`)
  })

  await t.test('path <hash>', async t => {
    const { stdout } = await cliExec(`path ${hash}`)
    t.equal(stdout.trim(), `${homedir()}/.p2pcommons/${hash}`)
  })
})

test('list', async t => {
  await t.test('list content', async t => {
    const contentTitle = String(Math.random())
    const profileName = String(Math.random())

    await cliExec(`create content -t=${contentTitle} -d=d -y`)
    await cliExec(`create profile -n=${profileName} -d=d -y`)

    const { stdout } = await cliExec('list content')
    t.ok(stdout.includes(contentTitle))
    t.notOk(stdout.includes(profileName))
  })

  await t.test('list profile', async t => {
    const contentTitle = String(Math.random())
    const profileName = String(Math.random())

    await cliExec(`create content -t=${contentTitle} -d=d -y`)
    await cliExec(`create profile -n=${profileName} -d=d -y`)

    const { stdout } = await cliExec('list profile')
    t.notOk(stdout.includes(contentTitle))
    t.ok(stdout.includes(profileName))
  })
})
