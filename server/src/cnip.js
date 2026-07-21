// 常见中国大陆 IP 段(CIDR)。用于 realIP 伪装:随机取一段,再在段内随机一个 IP。
const CN_CIDRS = [
  '58.14.0.0/15', '61.128.0.0/10', '116.25.0.0/16', '117.136.0.0/13',
  '119.128.0.0/13', '120.192.0.0/10', '122.224.0.0/12', '171.8.0.0/13',
  '182.80.0.0/12', '210.21.0.0/16', '223.64.0.0/11',
]

export function randomChinaIP() {
  const cidr = CN_CIDRS[Math.floor(Math.random() * CN_CIDRS.length)]
  const [base, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  const baseNum = base.split('.').reduce((acc, o) => acc * 256 + Number(o), 0)
  const host = Math.floor(Math.random() * 2 ** (32 - bits))
  const num = (baseNum + host) >>> 0
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.')
}
