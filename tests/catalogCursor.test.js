const { encodeCatalogCursor, decodeCatalogCursor } = require('../.test-dist/app/services/catalogCursor');
test.each([12.5, null])('cursor preserves snapshot and nullable value %s', lastSortValue => {
  const cursor = { snapshotId:'12',sort:'discount-desc',lastSortValue,lastProductNo:'123' };
  expect(decodeCatalogCursor(encodeCatalogCursor(cursor),'discount-desc')).toEqual(cursor);
});
test.each(['garbage',Buffer.from(JSON.stringify({v:2,snapshotId:'1',sort:'price-asc',lastSortValue:1,lastProductNo:'2'})).toString('base64url')])('rejects invalid cursor', raw => {
  expect(()=>decodeCatalogCursor(raw,'price-asc')).toThrow();
});
test('rejects mismatched sort and invalid field types',()=>{
  expect(()=>decodeCatalogCursor(encodeCatalogCursor({snapshotId:'1',sort:'price-asc',lastSortValue:1,lastProductNo:'2'}),'name-asc')).toThrow();
  for (const patch of [{snapshotId:1},{lastProductNo:'-1'},{lastSortValue:[]},{sort:'injection'}]) {
    const raw=Buffer.from(JSON.stringify({v:1,snapshotId:'1',sort:'price-asc',lastSortValue:1,lastProductNo:'2',...patch})).toString('base64url');
    expect(()=>decodeCatalogCursor(raw,'price-asc')).toThrow();
  }
});
test('rejects a date-like string that is not an observation timestamp',()=>{
  const raw=Buffer.from(JSON.stringify({v:1,snapshotId:'1',sort:'observed-desc',lastSortValue:'1',lastProductNo:'2'})).toString('base64url');
  expect(()=>decodeCatalogCursor(raw,'observed-desc')).toThrow();
});
