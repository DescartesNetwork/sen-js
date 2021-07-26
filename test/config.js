const payer = {
  address: '5vHjWRc2hys4XwZkMktg35N8oALt5d1ZXYkwCXXX3JHm',
  secretKey:
    'e06a1a17cf400f6c322e32377a9a7653eecf58f3eb0061023b743c689b43a5fa491573553e4afdcdcd1c94692a138dd2fd0dc0f6946ef798ba34ac1ad00b3720',
  keystore: {
    publicKey: '5vHjWRc2hys4XwZkMktg35N8oALt5d1ZXYkwCXXX3JHm',
    Crypto: {
      ciphertext:
        '9a25417dadbcf56da43294ec12bab6c89f776e4ab9e5229fe9f9767bfc84cd1f8db86b49f494f2c6b25c021ca993c6acc5c7dd04b7bbbb72070cab71b8f24b6d',
      cipherparams: { counter: 704929 },
      kdfparams: {
        c: 8192,
        dklen: 32,
        prf: 'sha512',
        salt: 'dd69e333c836de6214a664ad9bce28d3a5314eeda88adb308897c7458fa337d1',
      },
    },
  },
  password: '123',
}

const delegate = {
  secretKey:
    '2cedf5aba2387360b2e1cbfc649200bbda25f3ca01920c1e97bf81a58b91302180f78b4aeb06b742fd36decdbc60df7dfba2a606ba11de6c987eed1d827572a0',
}

const mints = [
  {
    address: '37m9dk3N7Biv5u4UHhgDbUs7QQnqxeYLnSaUrV176X8K',
  },
  {
    address: 'FhvkF3WdKLhF4XyQk3Gpf5CtTmfxAf31QLYNz8JCYevf',
  },
  {
    address: '6dF1XcKgPUFyYg65bFABmqtd8yztCS8pFWW9kZFKeBqH',
  },
]

module.exports = {
  payer,
  delegate,
  mints,
}
