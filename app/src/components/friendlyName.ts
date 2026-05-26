// Deterministic mythology name generator for 4-char hex agent IDs.
// Uses the high byte (first 2 hex chars) to select from 256 mythology names.
// Same ID always maps to the same name.

const NAMES: [string, string][] = [
  // [English, Chinese] — 256 mythology/legend characters from diverse cultures
  // Greek
  ["Zeus","宙斯"],["Hera","赫拉"],["Athena","雅典娜"],["Apollo","阿波罗"],
  ["Hermes","赫尔墨斯"],["Artemis","阿尔忒弥斯"],["Ares","阿瑞斯"],["Hades","哈迪斯"],
  ["Poseidon","波塞冬"],["Demeter","德墨忒尔"],["Hephaestus","赫菲斯托斯"],["Aphrodite","阿佛洛狄忒"],
  ["Dionysus","狄奥尼索斯"],["Persephone","珀尔塞福涅"],["Prometheus","普罗米修斯"],["Atlas","阿特拉斯"],
  ["Achilles","阿喀琉斯"],["Odysseus","奥德修斯"],["Perseus","珀尔修斯"],["Heracles","赫拉克勒斯"],
  ["Orpheus","俄耳甫斯"],["Theseus","忒修斯"],["Icarus","伊卡洛斯"],["Pandora","潘多拉"],
  ["Medusa","美杜莎"],["Phoenix","菲尼克斯"],["Chronos","克洛诺斯"],["Helios","赫利俄斯"],
  ["Selene","塞勒涅"],["Eros","厄洛斯"],["Nike","尼刻"],["Iris","伊里斯"],
  // Norse
  ["Odin","奥丁"],["Thor","索尔"],["Freya","弗蕾亚"],["Loki","洛基"],
  ["Baldur","巴尔德尔"],["Tyr","提尔"],["Fenrir","芬里尔"],["Heimdall","海姆达尔"],
  ["Frigg","弗丽嘉"],["Bragi","布拉基"],["Idun","伊登"],["Sif","希芙"],
  ["Skadi","丝卡蒂"],["Njord","尼约德"],["Vanir","华纳"],["Norns","诺恩"],
  ["Valkyrie","瓦尔基里"],["Ymir","伊米尔"],["Mimir","密米尔"],["Ran","兰"],
  // Roman
  ["Jupiter","朱庇特"],["Mars","马尔斯"],["Venus","维纳斯"],["Mercury","墨丘利"],
  ["Neptune","尼普顿"],["Minerva","密涅瓦"],["Pluto","普路托"],["Diana","狄安娜"],
  ["Juno","朱诺"],["Saturn","萨图恩"],["Vulcan","伏尔甘"],["Ceres","刻瑞斯"],
  ["Janus","雅努斯"],["Aurora","奥罗拉"],["Flora","弗洛拉"],["Luna","卢娜"],
  // Egyptian
  ["Ra","拉"],["Isis","伊西斯"],["Osiris","奥西里斯"],["Anubis","阿努比斯"],
  ["Horus","荷鲁斯"],["Thoth","托特"],["Bastet","巴斯特"],["Seth","赛特"],
  ["Maat","玛阿特"],["Hathor","哈索尔"],["Sekhmet","塞赫迈特"],["Sobek","索贝克"],
  ["Ptah","卜塔"],["Khnum","赫努姆"],["Nut","努特"],["Geb","盖布"],
  // Chinese
  ["Pangu","盘古"],["Nuwa","女娲"],["Fuxi","伏羲"],["Shennong","神农"],
  ["Huangdi","黄帝"],["Xuanwu","玄武"],["Qinglong","青龙"],["Zhuque","朱雀"],
  ["Baihu","白虎"],["Nezha","哪吒"],["Erlang","杨戬"],["Guanyin","观音"],
  ["Leigong","雷公"],["Zhurong","祝融"],["Gonggong","共工"],["Kuafu","夸父"],
  // Japanese
  ["Amaterasu","天照"],["Susanoo","须佐"],["Tsukuyomi","月读"],["Izanagi","伊邪那岐"],
  ["Izanami","伊邪那美"],["Raijin","雷神"],["Fujin","风神"],["Inari","稻荷"],
  ["Hachiman","八幡"],["Benzaiten","辩才天"],["Ebisu","惠比寿"],["Daikoku","大黑天"],
  // Hindu
  ["Vishnu","毗湿奴"],["Shiva","湿婆"],["Brahma","梵天"],["Ganesh","象头神"],
  ["Krishna","克里希纳"],["Rama","罗摩"],["Lakshmi","拉克什米"],["Saraswati","萨拉斯瓦蒂"],
  ["Hanuman","哈努曼"],["Kali","迦梨"],["Durga","杜尔迦"],["Indra","因陀罗"],
  ["Agni","阿耆尼"],["Surya","苏利耶"],["Vayu","伐由"],["Varuna","伐楼那"],
  // Celtic
  ["Dagda","达格达"],["Brigid","布丽吉德"],["Lugh","鲁格"],["Morrigan","莫丽甘"],
  ["Danu","达努"],["Cernunnos","科尔努诺斯"],["Epona","埃波娜"],["Manann","玛纳南"],
  // Mesopotamian
  ["Marduk","马尔杜克"],["Ishtar","伊什塔尔"],["Enlil","恩利尔"],["Enki","恩基杜"],
  ["Shamash","沙玛什"],["Tiamat","提亚马特"],["Gilgamesh","吉尔伽美什"],["Nanna","南纳"],
  // Slavic
  ["Perun","佩伦"],["Veles","维列斯"],["Mokosh","莫科什"],["Svarog","斯瓦罗格"],
  ["Stribog","斯特里博格"],["Dazhbog","达日博格"],["Marzanna","玛尔赞娜"],["Lada","拉达"],
  // Aztec / Mayan
  ["Quetzalcoatl","羽蛇神"],["Tezcatlipoca","特斯特利卡"],["Huitzilopochtli","维波奇特利"],
  ["Tlaloc","特拉洛克"],["Ixchel","伊希切尔"],["Kukulkan","库尔坎"],["Chaac","恰克"],["Ah Puch","阿普奇"],
  // African
  ["Anansi","阿南西"],["Eshu","埃舒"],["Ogun","奥贡"],["Shango","尚戈"],
  ["Yemoja","叶莫贾"],["Oshun","奥顺"],["Obatala","奥巴塔拉"],["Nyame","尼亚梅"],
  // Polynesian
  ["Maui","毛伊"],["Pele","佩蕾"],["Tangaroa","塔格罗阿"],["Tane","塔内"],
  // Legends
  ["Merlin","梅林"],["Morgan","摩根"],["Arthur","亚瑟"],["Lancelot","兰斯洛特"],
  ["Galahad","加拉哈德"],["Gawain","高文"],["Tristan","特里斯坦"],["Isolde","伊索尔德"],
  ["Beowulf","贝奥武夫"],["Sigurd","西格尔德"],["Brunhild","布伦希尔德"],["Siegfried","齐格弗里德"],
  ["Roland","罗兰"],["Titania","提泰妮亚"],["Oberon","奥伯龙"],["Robin","罗宾"],
  ["Sinbad","辛巴达"],["Aladdin","阿拉丁"],["Scheherazade","山鲁佐德"],["Mulan","木兰"],
  ["Sunwukong","孙行者"],["Bajie","八戒"],["Wujing","悟净"],["Tripitaka","唐三藏"],
  // Cosmic / Abstract
  ["Chaos","混沌"],["Gaia","盖亚"],["Nyx","尼克斯"],["Erebus","厄瑞玻斯"],
  ["Aether","以太"],["Hemera","赫墨拉"],["Tartarus","塔尔塔洛斯"],["Uranus","乌拉诺斯"],
  ["Nemesis","涅墨西斯"],["Tyche","堤喀"],["Moira","莫伊拉"],["Thanatos","塔纳托斯"],
  ["Hypnos","许普诺斯"],["Morpheus","摩耳甫斯"],["Boreas","玻瑞阿斯"],["Zephyrus","仄费罗斯"],
  // Mythical creatures
  ["Sphinx","斯芬克斯"],["Griffin","格里芬"],["Pegasus","珀伽索斯"],["Minotaur","弥诺陶洛斯"],
  ["Cerberus","刻耳柏洛斯"],["Chimera","喀迈拉"],["Hydra","许德拉"],["Typhon","提丰"],
  ["Leviathan","利维坦"],["Kraken","克拉肯"],["Jormungandr","耶梦加得"],["Garuda","迦楼罗"],
  ["Naga","那伽"],["Tengu","天狗"],["Kitsune","狐仙"],["Bahamut","巴哈姆特"],
  ["Simurgh","西摩格"],["Thunderbird","雷鸟"],["Dragon","龙"],["Titan","泰坦"],
  // Finnish
  ["Vainamoinen","维纳莫"],["Ilmarinen","伊尔玛宁"],["Louhi","洛乌希"],["Ukko","乌科"],
  // More Polynesian / Southeast Asian
  ["Tagaloa","塔格罗阿"],["Hina","希娜"],["Kamapua","卡马普阿"],["Ligor","利戈尔"],
  // Persian
  ["Ahura","阿胡拉"],["Mithra","密特拉"],["Anahita","阿娜希塔"],["Rostam","罗斯坦"],
  // More creatures
  ["Unicorn","独角兽"],["Manticore","曼提柯尔"],["Wyvern","飞龙"],["Basilisk","蛇精"],
  ["Yeti","雪人"],["Wendigo","温迪戈"],["Selkie","塞尔基"],["Djinn","精灵"],
];

/**
 * Generate a deterministic mythology name from a 4-char hex agent ID.
 * Uses the high byte (first 2 hex chars) to select from 256 names.
 * @param agentId  4-character hex string (e.g. "22AC")
 * @param lang     "en" | "zh"
 * @returns        e.g. "Athena" or "雅典娜"
 */
export function getFriendlyName(agentId: string, lang: "en" | "zh" = "en"): string {
  const hex = agentId.replace(/[^0-9a-fA-F]/g, "").slice(0, 4).padStart(4, "0");
  const hi = parseInt(hex.slice(0, 2), 16) || 0;
  const langIdx = lang === "zh" ? 1 : 0;
  return NAMES[hi % NAMES.length][langIdx];
}
