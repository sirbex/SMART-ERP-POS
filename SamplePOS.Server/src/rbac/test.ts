import { Pool } from 'pg';
import { RbacService } from './service.js';
import { seedRbacTables } from './seed.js';

async function testRbac() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
  });

  try {
    console.log('Testing RBAC System...\n');

    const service = new RbacService(pool);

    console.log('1. Getting permission catalog...');
    const permissions = await service.getPermissionCatalog();
    console.log(`   Found ${permissions.length} permissions\n`);

    console.log('2. Getting all roles...');
    const roles = await service.getAllRoles();
    console.log(`   Found ${roles.length} roles:`);
    for (const role of roles) {
      console.log(`   - ${role.name} (system: ${role.isSystemRole}, permissions: ${role.permissionCount})`);
    }
    console.log('');

    console.log('3. Getting Super Administrator role details...');
    const superAdminRole = roles.find(r => r.name === 'Super Administrator');
    if (superAdminRole) {
      const roleDetails = await service.getRole(superAdminRole.id);
      console.log(`   Role: ${roleDetails.name}`);
      console.log(`   Permissions: ${roleDetails.permissions.length}`);
      console.log('');
    }

    const testRoleName = `Test Sales Rep ${Date.now()}`;
    console.log(`4. Creating a test custom role: ${testRoleName}...`);
    const testUserId = '00000000-0000-0000-0000-000000000001';
    const customRole = await service.createRole(
      {
        name: testRoleName,
        description: 'Test role for sales representatives',
        permissionKeys: ['sales.read', 'sales.create', 'customers.read', 'pos.read', 'pos.create'],
      },
      testUserId
    );
    console.log(`   Created role: ${customRole.name} (id: ${customRole.id})`);

    console.log('\n5. Updating role description...');
    const updatedRole = await service.updateRole(
      customRole.id,
      { description: 'Updated test role description' },
      testUserId
    );
    console.log(`   Updated. Version: ${updatedRole?.version}`);

    console.log('\n6. Deleting test role...');
    await service.deleteRole(customRole.id, testUserId);
    console.log('   Deleted successfully');

    console.log('\n7. Checking audit logs...');
    const auditLogs = await service.getAuditLogs({ limit: 10 });
    console.log(`   Found ${auditLogs.total} audit entries`);
    for (const log of auditLogs.logs.slice(0, 5)) {
      console.log(`   - ${log.action} at ${log.timestamp}`);
    }

    console.log('\n✅ All RBAC tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testRbac();
