// Front cover is the base side of the closed fold (-Z); panel IDs follow the A-side sheet.
export function foldCovers(id) {
  const pairs = {half:[["back",0],["back",1]], cfold3:[["back",0],["back",1]],
    zfold3:[["back",0],["front",2]], gate4:[["back",1],["back",2]],
    accordion4:[["back",0],["back",3]], roll4:[["back",0],["back",1]], french:[["back",0],["back",1]]};
  return (pairs[id] || pairs.half).map(([side,index])=>({side,index}));
}
export function foldFaceLabel(id, side, index) {
  const role=foldCovers(id).findIndex(f=>f.side===side && f.index===index);
  return `${side === "front" ? "A" : "B"}${index+1}${role<0 ? " · 안쪽" : role===0 ? " · 앞표지" : " · 뒤표지"}`;
}
