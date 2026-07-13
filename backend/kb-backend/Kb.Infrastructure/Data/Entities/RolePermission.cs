using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class RolePermission
{
    public Guid RoleIdFk { get; set; }

    public string PermissionCode { get; set; } = null!;

    public virtual Role RoleIdFkNavigation { get; set; } = null!;
}
