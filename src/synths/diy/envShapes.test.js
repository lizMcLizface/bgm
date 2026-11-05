import {stageShape, exponentAt, SHAPE_NAMES} from './envShapes';

test('every shape runs from 0 to 1, and a straight line is one for the power and the mirrored curve', () => {
  expect(SHAPE_NAMES).toHaveLength(3);
  for (const mode of [0, 1, 2]) for (const c of [.5, 1, 2, 4]) {
    expect(stageShape(0, c, mode)).toBeCloseTo(0, 10);
    expect(stageShape(1, c, mode)).toBeCloseTo(1, 10);
  }
  expect(stageShape(.3, 1, 0)).toBeCloseTo(.3, 10);
  expect(stageShape(.3, 1, 1)).toBeCloseTo(.3, 10);
});

test('the mirrored curve is the power curve turned about the middle', () => {
  for (const c of [.5, 2, 3]) for (const x of [.1, .4, .8]) expect(stageShape(x, c, 1)).toBeCloseTo(1 - stageShape(1 - x, c, 0), 10);
});

test('the exponent that puts the midpoint at a level gives that level back', () => {
  for (const mode of [0, 1, 2]) for (const c of [.5, 1, 2, 3.5]) {
    const midpoint = stageShape(.5, c, mode);
    if (midpoint > .05 && midpoint < .95) expect(stageShape(.5, exponentAt(midpoint, mode), mode)).toBeCloseTo(midpoint, 6);
  }
});
