// The whole show lives here. Add, cut, or rewrite anything: each game draws a
// random handful from every list, so longer lists mean better replays.
//
// Name placeholders:
//   {A}, {B}  gap round: two players in random order
//   {S}, {O}  receipts round: S is in the hot seat, O is guessing

const QUESTIONS = {
  // Round 1: pick your own answer, then guess your partner's.
  mind: [
    { q: 'A free Saturday with zero plans. What do you actually want?', options: ['Bed until noon, no apologies', 'Out the door on an adventure', 'See people, make it social', 'Finally deal with the house stuff'] },
    { q: 'Mid-argument, you are most likely to…', options: ['Go quiet and stew', 'Bring receipts from years ago', 'Crack a joke at the worst moment', 'Apologize just to make it stop'] },
    { q: 'You find out you won $10,000. First instinct?', options: ['Book a trip immediately', 'Straight into savings', 'Spend it on something ridiculous', 'Tell absolutely no one'] },
    { q: 'What makes you feel most loved?', options: ['Hearing it out loud', 'Someone quietly handling something for me', 'Physical closeness', 'Undivided attention, phone down'] },
    { q: 'On a truly bad day, what do you want from your person?', options: ['Help me fix it', 'Just listen, no solutions', 'Distract me with something dumb', 'Give me space, then check in'] },
    { q: 'Which era of us has been your favorite so far?', options: ['The very beginning', 'Right now', 'One particular trip or adventure', 'Getting through a hard stretch together'] },
    { q: 'The worst movie-night sin?', options: ['Scrolling on your phone', 'Talking through the whole thing', 'Falling asleep in twenty minutes', 'Taking 45 minutes to choose'] },
    { q: 'The apocalypse hits. Your role in the group?', options: ['The leader nobody asked for', 'The one who actually knows things', 'Morale and comic relief', 'First to go, honestly'] },
    { q: 'On a road trip, you are…', options: ['The DJ who will not share', 'The snack manager', 'The backseat navigator', 'Asleep by the first exit'] },
    { q: 'The worst thing to hear after a long day?', options: ['"What\'s for dinner?"', '"We need to talk."', '"Did you see my text?"', '"Guess who\'s coming over!"'] },
    { q: 'What do you most want more of in the next year of us?', options: ['Adventure', 'Calm and routine', 'Time, just us', 'A big step forward'] },
    { q: 'You\'re in a petty mood. How does it come out?', options: ['Sighing loudly in another room', '"No, it\'s fine."', 'Doing the chore aggressively', 'I am never petty (I am lying)'] },
  ],

  // Round 2: secretly point at who it is. Disagree and you have to argue it out.
  finger: [
    'Who keeps arguing even after realizing they\'re wrong?',
    'Who is the worse driver?',
    'Who would actually keep it together in a real emergency?',
    'Who is messier, honestly?',
    'Who starts more of our fights?',
    'Who holds a grudge longer?',
    'Who apologizes first more often?',
    'Who fell first?',
    'Who is funnier?',
    'Who is more high-maintenance?',
    'Who is a bigger baby when they\'re sick?',
    'Who is more likely to get us thrown out of a wedding?',
    'Who spends more money on dumb stuff?',
    'Who is actually in charge of this relationship?',
    'Who is the better kisser?',
    'Who would last longer without their phone?',
    'Who remembers our arguments more accurately?',
  ],

  // Round 3: rate it 0 to 10. Points for landing close together.
  gap: [
    { q: 'How big a crime is leaving dishes in the sink overnight?', low: 'Who cares', high: 'Felony' },
    { q: 'How good a texter is {A}?', low: 'Carrier pigeon', high: 'Elite' },
    { q: 'How clean does the place need to be before guests come over?', low: 'They\'ll cope', high: 'Hospital grade' },
    { q: 'How acceptable is reading someone\'s phone over their shoulder?', low: 'Never', high: 'Totally fine' },
    { q: 'How much discussion should a $100 purchase need?', low: 'Just buy it', high: 'Formal hearing' },
    { q: 'How dramatic does {A} get when sick?', low: 'Stoic', high: 'Writing a will' },
    { q: 'How good is {A} at apologizing?', low: '"Sorry you feel that way"', high: 'Masterclass' },
    { q: 'How much time alone does a person really need each week?', low: 'None, stay here', high: 'Leave me for days' },
    { q: 'How jealous does {A} get?', low: 'Not at all', high: 'Full investigation' },
    { q: 'How romantic have we been lately?', low: 'Roommates', high: 'Movie montage' },
    { q: 'How fair do we fight?', low: 'Total war', high: 'Geneva-approved' },
    { q: 'How good is {A}\'s taste in movies and shows?', low: 'A crime', high: 'Impeccable' },
    { q: 'How late is "on time" actually allowed to be?', low: 'To the minute', high: 'It\'s a vibe' },
    { q: 'How well does {A} listen when {B} is venting?', low: 'Nodding at a phone', high: 'Hangs on every word' },
  ],

  // Round 4: {S} writes the truth, {O} writes a guess, then {S} judges the guess.
  receipts: [
    'If forced, what is {S}\'s most-repeated complaint about {O}?',
    'What would {S} order at 1 AM right now, no judgment?',
    'What does {S} get up to when nobody is around to see it?',
    'What is the pettiest thing about {O} that has ever quietly annoyed {S}?',
    'What song best describes {S}\'s mood lately?',
    'What is {O} wrong about that {S} has simply stopped arguing about?',
    'Which chore does {S} believe they do far more of?',
    'What was the last thing {O} did that made {S} smile?',
    'What does {S} only pretend to like?',
    'What is {S}\'s most irrational fear?',
    'Which of {O}\'s habits has {S} secretly picked up?',
    'What would {S} change about the way we spend our weekends?',
  ],

  // Round 5: both answer, both reveal, then each gives the other's answer hearts.
  soft: [
    'What is something your person does that makes you feel loved, and they probably don\'t realize it?',
    'When did you realize this was different from anything before?',
    'What is something you\'ve never properly thanked them for?',
    'What is something you\'ve been a little scared to ask for?',
    'Describe one ordinary Tuesday with us, five years from now.',
    'When have you been proudest to be with them?',
    'What small thing, if they did it, would make your whole week better?',
    'What is your favorite memory of us that they might have forgotten?',
    'What have you learned from them that stuck?',
    'Which of our fights actually made us better?',
  ],

  // Final round: wager, then try to pick the same answer without talking.
  final: [
    { q: 'If we were a movie, what genre are we?', options: ['Rom-com', 'Buddy cop', 'Heist', 'Disaster movie', 'Beautiful indie where nothing happens'] },
    { q: 'One word for this relationship.', options: ['Chaos', 'Home', 'Adventure', 'Comedy', 'Inevitable'] },
    { q: 'Ten years from now, where do we most obviously end up?', options: ['A house full of animals', 'Somewhere far away', 'The same couch, happier', 'Running something together', 'Still arguing about this game'] },
    { q: 'What is the title of our autobiography?', options: ['We Were Both Right', 'It Was Your Turn', 'Five More Minutes', 'Against All Advice', 'Okay But Hear Me Out'] },
  ],

  // The wheel: the winner collects one of these from the loser.
  prizes: [
    '15-minute massage, no clock-watching',
    'Breakfast made to order',
    'Total control of the TV for one night',
    'Loser does a chore of the winner\'s choice',
    'Loser plans the next date, start to finish',
    'One debate tonight: loser says "you were right" out loud',
    'Winner picks dinner, no veto',
    'A get-out-of-one-argument-free card',
  ],

  debateOpeners: [
    'Evidence only. Feelings will be heard at a later date.',
    'Cite specific incidents. Dates help.',
    'Make your case like there is a jury. There is not.',
    'Be convincing. The other person has to live with you.',
    'Keep it civil. Or do not. I just work here.',
  ],
};

if (typeof module !== 'undefined') module.exports = QUESTIONS;
