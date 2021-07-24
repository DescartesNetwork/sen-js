const KEY = 'senswap'
const EMPTY_DRIVER = {
  getItem: () => {
    throw new Error('No available driver was found')
  },
  setItem: () => {
    throw new Error('No available driver was found')
  },
}
const driver =
  typeof window == 'undefined' ? EMPTY_DRIVER : window.sessionStorage

const convert = (value: string | null) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (e) {
    return null
  }
}

const storage = {
  set: (key: string, value: any) => {
    let data = convert(driver.getItem(KEY))
    if (!data || typeof data !== 'object') data = {}
    data[key] = value
    driver.setItem(KEY, JSON.stringify(data))
  },
  get: (key: string) => {
    let data = convert(driver.getItem(KEY))
    if (!data || typeof data !== 'object') return null
    return data[key]
  },
  clear: (key: string) => {
    storage.set(key, null)
  },
}

export default storage
