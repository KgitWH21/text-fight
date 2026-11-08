import { readFile, writeFile } from 'node:fs/promises';
// Original short definitions; deliberately mixes useful objects, active verbs,
// textures, sounds, and unfamiliar words rather than a rarity-only word list.
const source = `
lantern|A portable light, with a flame or bulb protected inside.
threshold|The sill of a doorway; the point where something begins.
thimble|A small protective cap worn on a finger while sewing.
culvert|A passage carrying water beneath a road or path.
marrow|The soft tissue inside a bone; the innermost part of something.
hinge|A joint that lets a door, lid, or idea turn.
bramble|A tangled, prickly shrub, often bearing berries.
gutter|A channel along an edge that carries water away.
spindle|A slender rod used for spinning thread.
keel|The long structural spine along the bottom of a boat.
cinder|A small piece of partly burned coal or wood.
satchel|A bag with a shoulder strap, often closed with a flap.
quarry|A place where stone is dug out; also something pursued.
seam|The line where two pieces join.
turnstile|A rotating barrier that admits one person at a time.
chisel|A sharp tool for cutting or shaping hard material.
ferry|A boat that carries people across a stretch of water.
mantel|The shelf above a fireplace.
tendon|A tough cord of tissue joining muscle to bone.
hearth|The floor of a fireplace; a center of domestic life.
scaffold|A temporary supporting framework around a structure.
cistern|A tank for storing rainwater or other liquids.
shingle|A thin roof tile; or small rounded stones on a shore.
bellows|A device that squeezes air into a fire.
knuckle|A joint of a finger; a hard projecting bend.
locket|A small hinged ornament that holds a picture or keepsake.
gravel|Loose, small stones that crunch underfoot.
ledger|A book or record used to keep accounts.
spigot|A tap controlling the flow of liquid.
awning|A cover projecting from a building to provide shelter.
stairwell|The vertical space surrounding a flight of stairs.
brass|A yellow alloy of copper and zinc.
vellum|A fine writing surface traditionally made from animal skin.
reeds|Tall, slender plants growing in wet ground.
stubble|Short, stiff growth left after cutting hair or crops.
rafters|The sloping beams that support a roof.
shoal|A shallow place in water; or a group of fish.
fissure|A narrow crack or split in a surface.
gossamer|A fine, delicate thread or something as light as a web.
talus|A slope of loose rock fragments at the base of a cliff.
switchback|A road or path making sharp alternating turns.
milestone|A marker beside a road; a significant stage of progress.
trinket|A small ornament or keepsake of little monetary value.
turnip|A pale, round root vegetable with a sharp earthy taste.
anchor|A heavy device used to keep a vessel in place.
anvil|A heavy metal block on which hot metal is shaped.
scar|A mark left after a wound has healed.
orchard|Land planted with fruit trees.
wicket|A small gate or opening within a larger barrier.
shard|A sharp fragment broken from something brittle.
splinter|A thin, sharp fragment of wood or another hard material.
furrow|A long narrow trench; a deep crease in a face.
shudder|To shake suddenly from cold, fear, or strong feeling.
skitter|To move lightly and quickly with small restless motions.
clamber|To climb with awkward effort, using hands and feet.
wrench|To pull or twist violently; to tear something away.
coax|To draw someone toward an action with patient persuasion.
flinch|To make a small involuntary movement away from pain or fear.
sidle|To move sideways or approach in an indirect way.
gnaw|To bite persistently; to trouble someone steadily.
sputter|To make short explosive sounds or speak in broken bursts.
unspool|To unwind from a reel; to unfold little by little.
scrape|To drag a rough or sharp edge across a surface.
stagger|To move unsteadily or cause someone to reel.
bristle|To stand stiffly like hairs; to react with irritation.
scuttle|To hurry with short steps; to deliberately sink a vessel.
lurch|To move with a sudden, uncontrolled jerk.
crumple|To collapse into folds or lose firmness.
pry|To lever something open; to inquire too intrusively.
teeter|To balance unsteadily on an edge.
rasp|To make a harsh scraping sound.
flay|To strip away a covering; to criticize mercilessly.
plod|To walk slowly with heavy, persistent steps.
snag|To catch on something sharp or obstructing.
stoke|To feed fuel to a fire or intensify a feeling.
roil|To churn or stir into a turbulent state.
slacken|To become less tight, brisk, or intense.
chafe|To rub painfully; to feel irritated by restraint.
beckon|To signal someone to approach.
falter|To lose strength, confidence, or steadiness.
scour|To clean by hard rubbing; to search thoroughly.
smother|To cover closely enough to stifle or suppress.
cleave|To split apart; in another use, to cling closely.
winnow|To separate grain from chaff; to sift out what matters.
cradle|To hold gently and protectively.
flit|To move swiftly and lightly from place to place.
swivel|To turn around a central point.
recoil|To spring back from an impact or an alarming sight.
budge|To shift even slightly from a position.
saunter|To walk at a relaxed, unhurried pace.
slough|To shed or cast off an outer layer.
gouge|To cut or scoop out with force.
sprawl|To spread out loosely or occupy space without order.
fester|To grow worse beneath the surface, like an untreated wound.
slake|To satisfy thirst or cool something hot.
quaver|To tremble in sound or movement.
seethe|To boil or remain inwardly furious.
stipple|To cover a surface with small dots or short marks.
scald|To burn with hot liquid or steam.
glean|To gather useful pieces left behind or scattered about.
weather|To endure exposure or pass through difficulty.
fray|To wear into loose threads; to become strained.
furtive|Quietly secretive, as if trying to avoid notice.
brackish|Somewhat salty, especially where river and sea water mix.
wan|Pale, weak, or lacking vitality.
fallow|Left unplanted for a time; temporarily inactive.
lurid|Unpleasantly vivid or sensational.
limpid|Clear and transparent; easy to understand.
viscous|Thick and slow to flow.
caustic|Able to burn chemically; sharply cutting in speech.
threadbare|Worn thin; overused until little substance remains.
fitful|Coming and going in irregular bursts.
flinty|Hard like flint; stern or unyielding.
pliant|Flexible and easily bent or influenced.
ochre|An earthy yellow or reddish brown color.
tawny|A warm, sandy brown color.
serrated|Edged with sharp toothlike notches.
fugitive|Fleeing, elusive, or short lived.
tacit|Understood without being directly stated.
oblique|Slanting; indirect in expression or approach.
laconic|Using very few words.
mercurial|Quickly changing in mood or behavior.
tenuous|Thin, delicate, or weakly supported.
verdant|Green with growing plants.
sepulchral|Suggesting a tomb through darkness, hollowness, or gloom.
susurrus|A soft, continuous whispering or rustling sound.
petrichor|The earthy smell released when rain reaches dry ground.
liminal|At a threshold or between two states.
palimpsest|A reused writing surface with traces of earlier text.
crepuscular|Relating to twilight or active at that time.
numinous|Suggesting a mysterious spiritual presence.
psithurism|The whispering sound of wind in leaves.
apricity|The warmth of sunlight on a cold day.
velleity|A wish too slight to lead to action.
lacuna|A gap or missing portion in a text, record, or thought.
syzygy|An alignment of celestial bodies.
chiaroscuro|The interplay of light and dark in an image.
anodyne|Something that soothes; also blandly inoffensive.
inchoate|Just beginning and not yet clearly formed.
refulgent|Shining brightly.
halcyon|Calm and peaceful, often in memory.
desuetude|A state of no longer being used.
quiddity|The essential quality that makes a thing itself.
palaver|A prolonged discussion, often with unnecessary fuss.
penumbra|A region of partial shadow.
fugue|A layered musical form; a state of disturbed awareness.
torpor|A state of sluggishness or reduced activity.
umbrage|Offense or resentment at a perceived slight.
vestige|A surviving trace of something that has mostly vanished.
effigy|A representation of a person, often made for public display.
undertow|A current beneath the surface; a hidden emotional pull.
afterimage|An image that seems to remain after its source is gone.
stillness|The absence of movement or sound.
clamor|A loud mixture of voices, sounds, or demands.
crosswind|Wind blowing across the direction of travel.
kindling|Small dry pieces used to start a fire.
fathom|A measure of water depth; to understand something difficult.
wayward|Straying from a course or resisting control.
steadfast|Firm and reliable through difficulty.
unravel|To undo threads or gradually expose a hidden structure.
smolder|To burn slowly without flame; to feel quietly intense.
glimmer|A faint, wavering light or small hint of something.
hovel|A small dwelling in poor condition.
solstice|Either of the two annual extremes of the sun's path.
cairn|A pile of stones used as a marker or memorial.
scrim|A thin fabric screen that partly conceals what is behind it.
lintel|The horizontal support above a doorway or window.
reverberate|To echo repeatedly or have effects that continue.
`; 
const extra = await readFile(new URL('./offline-words-extra.txt', import.meta.url), 'utf8');
const newLines = extra.trim().split('\n');
if (newLines.length !== 1000) throw Error('The offline expansion must contain exactly 1,000 entries.');
const seen = new Set();
const words = [...source.trim().split('\n'), ...newLines].map((line, index) => {
  const fields = line.split('|');
  const type = fields[0].trim(), example = fields[1]?.trim();
  if (fields.length !== 2 || !/^[\p{L}]+(?:['’\-][\p{L}]+)*$/u.test(type) || !example) throw Error(`Invalid word entry on line ${index + 1}`);
  const key = type.toLowerCase();
  if (seen.has(key)) throw Error(`Duplicate word: ${type}`);
  seen.add(key);
  return { type, example };
});
await writeFile('data/words.json', JSON.stringify(words, null, 2) + '\n');
console.log(`Created ${words.length} offline vocabulary cards.`);
