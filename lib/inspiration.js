// Inkwell Daily Pro's front-page picture: a photograph an image service
// makes from a scene, with an inspirational quote set over it in the
// paper's own type. No photo of you goes anywhere. The same date always
// gets the same scene and quote. (The headshot portrait in portrait.js is
// parked for now.)

"use strict"

const crypto = require("node:crypto")

const IG = require("./imagegen.js")

// Words long out of copyright, or said in public by their speakers.
const QUOTES = [
  ["The secret of getting ahead is getting started.", "Mark Twain"],
  ["Well done is better than well said.", "Benjamin Franklin"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["Do what you can, with what you have, where you are.", "Theodore Roosevelt"],
  ["Act as if what you do makes a difference. It does.", "William James"],
  ["What we think, we become.", "Buddha"],
  ["The journey of a thousand miles begins with one step.", "Lao Tzu"],
  ["Nothing will work unless you do.", "Maya Angelou"],
  ["Quality is not an act, it is a habit.", "Aristotle"],
  ["He who has a why to live can bear almost any how.", "Friedrich Nietzsche"],
  ["Simplicity is the ultimate sophistication.", "Leonardo da Vinci"],
  ["Little by little, one travels far.", "J. R. R. Tolkien"],
  ["Energy and persistence conquer all things.", "Benjamin Franklin"],
  ["Whatever you are, be a good one.", "Abraham Lincoln"],
  ["The best way out is always through.", "Robert Frost"],
  ["Begin, be bold, and venture to be wise.", "Horace"],
  ["Fortune favors the bold.", "Virgil"],
  ["The harder the conflict, the more glorious the triumph.", "Thomas Paine"],
  ["Genius is one percent inspiration and ninety-nine percent perspiration.", "Thomas Edison"],
  ["Dwell in possibility.", "Emily Dickinson"],
  ["To improve is to change; to be perfect is to change often.", "Winston Churchill"],
  ["We are what we repeatedly do.", "Will Durant"],
  ["Make each day your masterpiece.", "John Wooden"],
  ["Small deeds done are better than great deeds planned.", "Peter Marshall"],
  ["The man who moves a mountain begins by carrying away small stones.", "Confucius"],
  ["You miss one hundred percent of the shots you don't take.", "Wayne Gretzky"],
  ["Keep your face always toward the sunshine.", "Walt Whitman"],
  ["Perseverance is not a long race; it is many short races one after another.", "Walter Elliot"],
  ["Plans are nothing; planning is everything.", "Dwight D. Eisenhower"],
  ["In the middle of difficulty lies opportunity.", "Albert Einstein"]
]

const SCENES = [
  "a lone climber reaching a snowy summit at sunrise",
  "a lighthouse on a rocky coast under a dramatic sky",
  "a long empty road through red desert canyons at golden hour",
  "a sailboat on a calm sea at dawn",
  "a forest path lit by shafts of morning light",
  "a city skyline at blue hour with lights coming on",
  "a runner crossing a bridge in early morning fog",
  "a wheat field rolling to the horizon under summer clouds",
  "a waterfall in a green mountain valley",
  "a hot air balloon rising over misty hills",
  "a quiet workshop bench with tools in warm window light",
  "an observatory dome under a sky full of stars",
  "a rowing crew on a glassy river at sunrise",
  "a mountain lake reflecting snowy peaks",
  "a train crossing a high stone viaduct through autumn trees",
  "a rocket on a launch pad at twilight",
  "a surfer paddling out toward a big wave",
  "an old library reading room with tall windows",
  "a bicycle leaning on a seaside railing at sunset",
  "cherry trees in bloom along a canal"
]

function seed(key, salt) {
  return parseInt(crypto.createHash("sha1").update(salt + String(key)).digest("hex").slice(0, 8), 16)
}

function pick(key) {
  const q = QUOTES[seed(key, "quote:") % QUOTES.length]
  return { scene: SCENES[seed(key, "scene:") % SCENES.length], quote: q[0], author: q[1] }
}

// What the service is asked for: a photograph, and room for the quote.
function prompt(scene) {
  return "A cinematic documentary photograph of " + scene + ". Wide composition with open sky or calm space in the upper third. " +
    "Natural light, rich detail. No people's faces in close-up, no logos, no brand names, no text or lettering anywhere."
}

// config.json's "headlines": { enabled, service, model }. Only Recraft
// makes pictures from words alone for now.
function settings(cfg, lookupKey) {
  const h = cfg && typeof cfg.headlines === "object" && cfg.headlines ? cfg.headlines : {}
  const out = { enabled: h.enabled !== false, generator: null }
  if (h.service !== "recraft") return out
  const model = typeof h.model === "string" ? h.model.trim().slice(0, 80) : ""
  out.generator = { service: "recraft", model: model, key: (lookupKey || IG.apiKey)("recraft") }
  return out
}

// The day's picture and quote, or null without a service. A service that
// fails costs the picture, never the paper; the reason comes back.
async function picture(key, gen, deps) {
  if (!gen) return null
  const p = pick(key)
  const d = deps || {}
  try {
    const bytes = await IG.scene(gen.service, { key: gen.key, model: gen.model, prompt: prompt(p.scene), fetch: d.fetch })
    const type = require("./fetch.js").sniffImage(bytes)
    return { image: "data:image/" + type + ";base64," + bytes.toString("base64"), scene: p.scene, quote: p.quote, author: p.author,
      provider: gen.service + (gen.model ? ":" + gen.model : ""), drawnBy: IG.SERVICES[gen.service].name, date: key }
  } catch (e) {
    return { problem: e.message }
  }
}

module.exports = { QUOTES, SCENES, pick, prompt, settings, picture }
