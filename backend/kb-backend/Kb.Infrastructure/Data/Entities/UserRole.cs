using System;
using System.Collections.Generic;

namespace Kb.Infrastructure.Data.Entities;

public partial class UserRole
{
    public Guid UserId { get; set; }

    public Guid RoleId { get; set; }

    public Guid? AssignedByFk { get; set; }

    public DateTime AssignedAt { get; set; }

    public virtual User? AssignedByFkNavigation { get; set; }

    public virtual Role Role { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
