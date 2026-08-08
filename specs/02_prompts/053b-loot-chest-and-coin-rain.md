## Task

[53b] Draw a real chest, and make the opening physical: the chest rattles, its lid swings, coins
fountain out, the prize lands. A bonus reward adds full-screen confetti.

[53a] gave the reveal a stage. This gives it something worth watching.

## Decisions

**1. A drawn chest, not the app's logo.** Owner's call, and it is right. The logo is the brand's
mark; the chest is *the object being opened*. Reusing the logo would have been cheaper and would have
made the moment generic — the same picture that is already in the corner of every screen.

**2. The sequence is rattle → lid → coins → prize**, in that order, and each stage is a separate
keyframe rather than one long timeline. Separate stages can be skipped individually under reduced
motion, and a single long animation cannot.

**3. Coins fountain rather than fall.** Gravity alone reads as spilling. An upward impulse followed by
a fall reads as *coming out of something*, which is the sentence this animation has to say.

**4. Confetti is reserved for the bonus reward.** It is roughly a one-in-ten outcome. Firing it on
every open would spend the loudest signal in the app on the ordinary case and leave nothing for the
rare one.

**5. No bare words in the prize.** The prize lands as the same marks and typography the rest of the
app uses for that currency — a Coins figure looks like a Coins figure everywhere, including here.

**No animation library.** All of this is CSS keyframes. The zero-dependency property is worth more
than any easing curve, and every stage here is a transform and an opacity.

## Test requirement

1. Each stage appears and is removed in order; the prize is last.
2. Confetti renders for a bonus-reward prize and **not** for a coins-only prize. Assert both
   directions — a test that only checks the confetti case passes against a version that always fires
   it.
3. Reduced motion hides every animated stage, and the prize is still fully rendered and readable.
4. The prize figure renders through the shared currency display, not through local markup.
