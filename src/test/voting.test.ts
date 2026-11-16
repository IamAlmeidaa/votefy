import { describe, expect, it } from 'vitest';
import { candidates, vote, winner, type Room } from '@/lib/music';
const room = (): Room => ({id:'LOCAL',name:'Test',admin:'a',active:'a',participants:[{id:'a',name:'A'},{id:'b',name:'B'}],current:'now',options:['one','two','three','four'],votes:{},open:true,queue:[],history:[],chat:[]});
describe('Local music voting rules', () => {
  it('generates four options', () => expect(candidates(['a','b','c','d','e','f'])).toHaveLength(4));
  it('never includes the current track', () => expect(candidates(['now','one','two'],'now')).not.toContain('now'));
  it('uses all remaining tracks when fewer than four are available', () => expect(candidates(['now','one','two'],'now').sort()).toEqual(['one','two']));
  it('stores just one vote per participant', () => { const r = vote(vote(room(),'a','one',['one','two']),'a','one',['one','two']); expect(Object.values(r.votes)).toEqual(['one']); });
  it('allows changing a vote while open', () => { const r = vote(vote(room(),'a','one',['one','two']),'a','two',['one','two']); expect(r.votes).toEqual({a:'two'}); });
  it('rejects votes when closed', () => expect(vote({...room(),open:false},'a','one',['one']).votes).toEqual({}));
  it('rejects unavailable tracks', () => expect(vote(room(),'a','one',[]).votes).toEqual({}));
  it('rejects choices outside the round', () => expect(vote(room(),'a','other',['other']).votes).toEqual({}));
  it('rejects the current track even if present in options', () => expect(vote({...room(),options:['now']},'a','now',['now']).votes).toEqual({}));
  it('rejects nonparticipants', () => expect(vote(room(),'fake','one',['one']).votes).toEqual({}));
  it('counts different participants separately', () => { const r = vote(vote(room(),'a','one',['one']),'b','one',['one']); expect(Object.values(r.votes).filter(v => v === 'one')).toHaveLength(2); });
  it('selects the track with the most votes', () => expect(winner({...room(),votes:{a:'two',b:'two',c:'one'}},['one','two'],()=>0)).toBe('two'));
  it('breaks ties randomly', () => expect(winner({...room(),votes:{a:'one',b:'two'}},['one','two'],()=>.99)).toBe('two'));
  it('chooses randomly when nobody votes', () => expect(winner(room(),['one','two','three','four'],()=>.99)).toBe('four'));
});