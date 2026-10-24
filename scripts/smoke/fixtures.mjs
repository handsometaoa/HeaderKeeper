// 冒烟测试用的配置与导入数据样例
export const LEGACY_CONFIG = {
  globalEnabled: true,
  systems: [
    {
      id: 'legacy-sys',
      name: '旧系统',
      domains: ['old.acme.cn'],
      enabled: true,
      activeSchemeId: null,
      schemes: [
        {
          id: 'legacy-req',
          name: '旧需求',
          description: '旧结构',
          expiresAt: null,
          headers: [{ id: 'legacy-pair', key: 'X-Old', value: '1' }],
        },
      ],
    },
  ],
};

export function testConfig() {
  const now = Date.now();
  return {
    version: 2,
    globalEnabled: true,
    requirements: [
      {
        id: 'req1',
        name: '需求1',
        description: '张三 - 购物车改版',
        expiresAt: null,
        createdAt: now - 3000,
        headers: [{ id: 'p1', key: 'X-Lane', value: 'feature-cart-a' }],
      },
      {
        id: 'req2',
        name: '需求2',
        description: '李四 - 结算优化',
        expiresAt: null,
        createdAt: now - 2000,
        headers: [{ id: 'p2', key: 'X-Lane', value: 'feature-cart-b' }],
      },
      {
        id: 'req3',
        name: '需求3',
        description: '共享 - 积分灰度',
        expiresAt: null,
        createdAt: now - 1000,
        headers: [{ id: 'p3', key: 'X-Points', value: 'v2' }],
      },
    ],
    systems: [
      {
        id: 'sys1',
        name: '运营后台',
        domains: ['admin.acme.cn', '*.admin.acme.cn'],
        enabled: true,
        requirementIds: ['req1', 'req2'],
        activeRequirementId: null,
      },
      {
        id: 'sys2',
        name: '会员中心',
        domains: ['admin.acme.cn'],
        enabled: true,
        requirementIds: ['req2', 'req3'],
        activeRequirementId: null,
      },
    ],
  };
}

export const IMPORT_STANDARD_JSON = JSON.stringify([
  {
    id: 'import-a',
    name: '导入需求A',
    description: '标准导入',
    headers: [{ key: 'X-Imported', value: 'yes' }],
  },
  { id: 'req1', name: '冲突ID' },
  // id 是新的，但名称与库中需求3重复 → 应按名称判冲突
  { id: 'import-x', name: '需求3' },
  { name: '需求2' },
  { name: '无ID需求', description: '自动生成 id' },
  { description: '缺少名称' },
]);

export const IMPORT_CUSTOM_JSON = JSON.stringify({
  items: [{ code: 'EXT-1', title: '脚本需求', lane: 'lane-x' }],
});

export const IMPORT_CUSTOM_CODE = `return data.items.map((item) => ({
  id: item.code,
  name: item.title,
  description: '来自自定义解析',
  expiresAt: null,
  headers: [{ key: 'X-Lane', value: item.lane }],
}));`;
