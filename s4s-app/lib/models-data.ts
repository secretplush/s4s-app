// Real model data from OnlyFans API - Updated 2026-02-08
export interface Model {
  id: string
  username: string
  displayName: string
  fans: number
  likes: number
  avatar: string
  connected: boolean
  totalEarnings: number // Lifetime earnings in USD (NET, after 20% fee)
}

// Helper to calculate LTV
export function calculateLTV(model: Model): number {
  if (model.fans === 0) return 0
  return model.totalEarnings / model.fans
}

export const CONNECTED_MODELS: Model[] = [
  {
    id: 'acct_ebca85077e0a4b7da04cf14176466411',
    username: 'milliexhart',
    displayName: 'Millie Hart',
    fans: 2547,
    likes: 1141,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/i/im/imm/immx4rrlkhilts5dh39x83bedpl6wyng1768418465/544695119/avatar.jpg',
    connected: true,
    totalEarnings: 7408.18
  },
  {
    id: 'acct_f05bf7874c974a5d875a1ef01c5bbc3b',
    username: 'zoepriceee',
    displayName: 'Zoe Price',
    fans: 3619,
    likes: 1267,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/m/md/mdn/mdnhc1nz9ox94ihg7u16t8rhyjv6jged1768087936/544182349/avatar.jpg',
    connected: true,
    totalEarnings: 9141.66
  },
  {
    id: 'acct_9ee32f0bac4e4e8394a09f2c9fa2fbb7',
    username: 'novaleighh',
    displayName: 'Nova Leigh',
    fans: 3368,
    likes: 1603,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/i/ie/ie0/ie0meiwycqhcehkd78v4l9dbnaxw1z6y1768093624/543468095/avatar.jpg',
    connected: true,
    totalEarnings: 11754.34
  },
  {
    id: 'acct_0653d6e6c3984bea8d3adc84cc616c7c',
    username: 'lucymonroee',
    displayName: 'Lucy Monroe',
    fans: 1129,
    likes: 441,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/s/sq/sqp/sqpf8x4pmbvxrnymrxfypbed1mfpuk2e1769621307/543659016/avatar.jpg',
    connected: true,
    totalEarnings: 2454.68
  },
  {
    id: 'acct_6bb6d77ac2c741ecb54d865237bb04f4',
    username: 'chloecookk',
    displayName: 'Chloe Cook',
    fans: 7541,
    likes: 4519,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/m/md/mdl/mdlfvy5r0vparh7hhfajc6t6jk9ol6al1767766776/543655743/avatar.jpg',
    connected: true,
    totalEarnings: 55865.34
  },
  {
    id: 'acct_bd6a75d6943141589cf5e43586653258',
    username: 'jackiesmithh',
    displayName: 'Jackie Smith',
    fans: 1570,
    likes: 1026,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/e/e9/e9m/e9m0roaeabodtursjgckicnhxqxdtizv1759783375/527476418/avatar.jpg',
    connected: true,
    totalEarnings: 4886.94
  },
  {
    id: 'acct_749c75e13d7e4685813f2a2867ce614d',
    username: 'brookeewest',
    displayName: 'Brooke West',
    fans: 2462,
    likes: 1676,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/r/rl/rlu/rluvlnnlbfqerqrp91eg7jsfpxjlf3a31762104304/531889164/avatar.jpg',
    connected: true,
    totalEarnings: 7298.48
  },
  {
    id: 'acct_b0b0698a614643c5932cfccd23f7c430',
    username: 'ayaaann',
    displayName: 'Aya Ann',
    fans: 7113,
    likes: 7190,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/s/sc/scq/scqnyfycb5bif9h3ocalfv18m2xdtxud1758769408/525242883/avatar.jpg',
    connected: true,
    totalEarnings: 32150.95
  },
  {
    id: 'acct_b5e739f9f40a4da99b2f5ca559168012',
    username: 'chloeecavalli',
    displayName: 'Chloe Cavalli',
    fans: 3294,
    likes: 1812,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/a/aw/awu/awuql1oyh5f663gf75tycuv5s9ipephj1766518426/537028788/avatar.jpg',
    connected: true,
    totalEarnings: 10089.31
  },
  {
    id: 'acct_cfb853d0ba714aeaa9a89e3026ec6190',
    username: 'sadieeblake',
    displayName: 'Sadie Blake',
    fans: 29749,
    likes: 33331,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/z/zw/zwk/zwkype5jeyivmb287n1ba6yd6wmfvdgr1764902344/526616700/avatar.jpg',
    connected: true,
    totalEarnings: 212170.56
  },
  {
    id: 'acct_bde8d615937548f18c4e54b7cedf8c1d',
    username: 'lolasinclairr',
    displayName: 'Lola Sinclair',
    fans: 4815,
    likes: 2211,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/3/3p/3pt/3ptchepy7oro0ypbpnjpiydd4ancwno91769395473/543872404/avatar.jpg',
    connected: true,
    totalEarnings: 14463.57
  },
  {
    id: 'acct_a50799a789a6422c8389d7d055fcbd1a',
    username: 'maddieharperr',
    displayName: 'Maddie Harper',
    fans: 4400,
    likes: 3338,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/s/se/seq/seqtznbuzdeuvuyq0rqx8jdhilxqbefp1762004551/529687791/avatar.jpg',
    connected: true,
    totalEarnings: 28263.34
  },
  {
    id: 'acct_fbd172e2681f4dfbb6026ce806ecaa28',
    username: 'zoeemonroe',
    displayName: 'Zoe Monroe',
    fans: 10177,
    likes: 12251,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/u/u3/u3v/u3vqfnlgcrqkgue7rbt5r0xjpkua0fuw1757346851/522110263/avatar.jpg',
    connected: true,
    totalEarnings: 47298.83
  },
  {
    id: 'acct_54e3119e77da4429b6537f7dd2883a05',
    username: 'biancaawoods',
    displayName: 'Bianca Woods',
    fans: 7453,
    likes: 4762,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/3/3m/3mm/3mmvdpvsmezdphq6mpdqxwy3wl0wf1kg1762789515/525755724/avatar.jpg',
    connected: true,
    totalEarnings: 45993.30
  },
  {
    id: 'acct_2648cedf59644b0993ade9608bd868a1',
    username: 'aviannaarose',
    displayName: 'Avianna Rose',
    fans: 2649,
    likes: 2514,
    avatar: 'https://thumbs.onlyfans.com/public/files/thumbs/c144/r/rn/rnd/rndb0kveiej4fnsrgrakmbiuy2iktzki1762744168/532745754/avatar.jpg',
    connected: true,
    totalEarnings: 20613.97
  },
  // New models added 2026-02-10
  {
    id: 'acct_29037b1ef83d4c838ab2ec49d61d26f6',
    username: 'jessicaparkerrr',
    displayName: 'Jessica Parker',
    fans: 28597,
    likes: 162,
    avatar: 'https://public.onlyfans.com/files/r/ra/rai/raivfy8z7o2mg6r22ai3js1cyyk056nv1751804044/507343013/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_487806e5751b487bb302793ee1c3ef2c',
    username: 'kaliblakexo',
    displayName: 'Kali Blake',
    fans: 41166,
    likes: 182,
    avatar: 'https://public.onlyfans.com/files/4/43/43n/43njxk7xsr7c9yrwkpccody4flspc5c21769200361/507053395/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_c85c710e083f4b4a94d826f76855543d',
    username: 'laceythomass',
    displayName: 'Lacey Thomas',
    fans: 68491,
    likes: 234,
    avatar: 'https://public.onlyfans.com/files/e/ea/eaa/eaajrvl0jnx4jyayu5jxta30esiioajz1769989366/465737449/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_04d878af1813422fa6b310991f687d73',
    username: 'lindamarievip',
    displayName: 'Linda Marie',
    fans: 18743,
    likes: 585,
    avatar: 'https://public.onlyfans.com/files/y/yb/yb8/yb8mkvci9r0tbaocqv9mb8tdwhuhlgsq1700071577/122926191/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_e84886b3217e4fbd8f82ee63ca8894e8',
    username: 'lilyyymonroee',
    displayName: 'Lily Monroe',
    fans: 32385,
    likes: 184,
    avatar: 'https://public.onlyfans.com/files/v/vg/vgh/vghlvw16usbxjcsuwb5aroivzifof4rg1747509595/499585049/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_bfd09358f67849cba6d9f8cf4a565cd2',
    username: 'dollyrhodesss',
    displayName: 'Dolly Rhodes',
    fans: 17780,
    likes: 175,
    avatar: 'https://public.onlyfans.com/files/s/sw/sw7/sw7icm45ddlp5owwqhlp9tsilgfxrbrl1756371226/515556945/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_b5f1a5fc3cfd4a959dbea7230814ae71',
    username: 'chelseapaige',
    displayName: 'Chelsea Paige',
    fans: 766,
    likes: 9,
    avatar: 'https://public.onlyfans.com/files/a/a6/a62/a62pk4oi5xbl79y43rvulysnz7t4mwll1768432164/543526823/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_8b4b062aeef1441ba8f51a7b0f3fe5f2',
    username: 'thesarasky',
    displayName: 'Sara Sky',
    fans: 56040,
    likes: 730,
    avatar: 'https://public.onlyfans.com/files/x/xl/xld/xldduucdlrpakibmatfwrvtksmee7o9s1745462174/273686795/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_15870053c2604e0f9e94d14a10749923',
    username: 'yourrfavblondie',
    displayName: 'Remi Skye',
    fans: 108,
    likes: 0,
    avatar: 'https://public.onlyfans.com/files/u/um/umv/umv9dbjhtkuk2gln3xodmaf0tqwh3rte1770407224/539053779/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_7a273714a275417992b0f7c1d3389a2c',
    username: 'skyyroseee',
    displayName: 'Sky Rose',
    fans: 260,
    likes: 5,
    avatar: 'https://public.onlyfans.com/files/0/0n/0nq/0nq7cwssclzbnojnsappmucraerz0sbd1769611487/548240223/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_766a8451ee6946009d20581ab11fdfc4',
    username: 'tyybabyy',
    displayName: 'Ty',
    fans: 39055,
    likes: 417,
    avatar: 'https://public.onlyfans.com/files/w/wj/wjd/wjdyixzx8kwjllf2viylyljctk0sfy4b1698996864/43518697/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_ac70731a489741f0b6abc45a050f0301',
    username: 'itsmealexisrae',
    displayName: 'Alexis Rae',
    fans: 49269,
    likes: 913,
    avatar: 'https://public.onlyfans.com/files/g/g3/g3p/g3pny2syj4ykdojyylbbuef41fafm6zq1719964628/343036974/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_40e51b831b3247ac806755362b494fe5',
    username: 'lolaxmae',
    displayName: 'Lola Mae',
    fans: 517,
    likes: 3,
    avatar: 'https://public.onlyfans.com/files/d/dc/dcp/dcpf7eyprycpoihc9r0s5xfj4rgjjbu61769966424/538873960/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_6f2328ebe4c446038ea1847d2dbecc17',
    username: 'rebeccabrownn',
    displayName: 'Rebecca Brown',
    fans: 666,
    likes: 22,
    avatar: 'https://public.onlyfans.com/files/c/c7/c7b/c7blgaiwjgklupohudqyj5njwekbr3ra1770070485/548279176/avatar.jpg',
    connected: true,
    totalEarnings: 0
  },
  {
    id: 'acct_9665889fec2b46e9a05232afee59ef19',
    username: 'oliviabrookess',
    displayName: 'Olivia Brookes',
    fans: 40908,
    likes: 503,
    avatar: 'https://public.onlyfans.com/files/d/dj/dje/djevrcxsoaumnvyvjoj3n9yqxigna3d91735921678/466573608/avatar.jpg',
    connected: true,
    totalEarnings: 0
  }
]

// Fetch live models from the OF API sync endpoint
export async function fetchLiveModels(baseUrl: string): Promise<Model[]> {
  try {
    const res = await fetch(`${baseUrl}/api/sync-accounts`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Sync API ${res.status}`)
    const { accounts } = await res.json()
    return accounts.map((a: any) => ({
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      fans: a.fans,
      likes: a.likes,
      avatar: a.avatar,
      connected: a.isAuthenticated,
      totalEarnings: 0, // earnings not available from API
    }))
  } catch (e) {
    console.error('fetchLiveModels failed, using static fallback:', e)
    return CONNECTED_MODELS
  }
}

// Totals
export const NETWORK_STATS = {
  totalModels: 30,
  totalFans: CONNECTED_MODELS.reduce((sum, m) => sum + m.fans, 0),
  totalLikes: CONNECTED_MODELS.reduce((sum, m) => sum + m.likes, 0),
  totalEarnings: CONNECTED_MODELS.reduce((sum, m) => sum + m.totalEarnings, 0),
  avgLTV: CONNECTED_MODELS.reduce((sum, m) => sum + m.totalEarnings, 0) / CONNECTED_MODELS.reduce((sum, m) => sum + m.fans, 0) || 0,
  topPerformer: CONNECTED_MODELS.reduce((top, m) => m.fans > top.fans ? m : top, CONNECTED_MODELS[0]),
  topEarner: CONNECTED_MODELS.reduce((top, m) => m.totalEarnings > top.totalEarnings ? m : top, CONNECTED_MODELS[0])
}
