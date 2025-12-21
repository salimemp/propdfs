import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  Users, Plus, UserPlus, Settings, Crown, Shield, Eye,
  Loader2, MoreVertical, Mail, Trash2
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Teams() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [authLoading, isAuthenticated]);

  const { data: teams, isLoading: teamsLoading, refetch: refetchTeams } = trpc.teams.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: usageStats } = trpc.user.getUsageStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const createTeamMutation = trpc.teams.create.useMutation({
    onSuccess: () => {
      toast.success("Team created successfully");
      setIsCreateTeamOpen(false);
      setNewTeamName("");
      setNewTeamDescription("");
      refetchTeams();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const inviteMemberMutation = trpc.teams.addMember.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent successfully");
      setIsInviteOpen(false);
      setInviteEmail("");
      setInviteRole("viewer");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) {
      toast.error("Please enter a team name");
      return;
    }
    createTeamMutation.mutate({
      name: newTeamName.trim(),
      description: newTeamDescription.trim() || undefined,
    });
  };

  const handleInviteMember = () => {
    if (!inviteEmail.trim() || !selectedTeamId) {
      toast.error("Please enter an email address");
      return;
    }
    inviteMemberMutation.mutate({
      teamId: selectedTeamId,
      email: inviteEmail.trim(),
      role: inviteRole,
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700';
      case 'editor': return 'bg-blue-100 text-blue-700';
      case 'viewer': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="h-3 w-3" />;
      case 'editor': return <Shield className="h-3 w-3" />;
      case 'viewer': return <Eye className="h-3 w-3" />;
      default: return null;
    }
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const isPaidUser = usageStats?.tier !== 'free';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Teams</h1>
            <p className="text-slate-600 mt-1">
              Collaborate with your team on documents
            </p>
          </div>
          {isPaidUser ? (
            <Dialog open={isCreateTeamOpen} onOpenChange={setIsCreateTeamOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Team</DialogTitle>
                  <DialogDescription>
                    Create a team to collaborate with others on documents
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="team-name">Team Name</Label>
                    <Input
                      id="team-name"
                      placeholder="e.g., Marketing Team"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="team-description">Description (optional)</Label>
                    <Input
                      id="team-description"
                      placeholder="What does this team work on?"
                      value={newTeamDescription}
                      onChange={(e) => setNewTeamDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateTeamOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateTeam} disabled={createTeamMutation.isPending}>
                    {createTeamMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Team
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Link href="/pricing">
              <Button className="gap-2">
                <Crown className="h-4 w-4" />
                Upgrade to Create Teams
              </Button>
            </Link>
          )}
        </div>

        {/* Upgrade Banner for Free Users */}
        {!isPaidUser && (
          <Card className="bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-1">Unlock Team Collaboration</h3>
                  <p className="text-purple-100">
                    Upgrade to Pro or Enterprise to create teams, share workspaces, and collaborate in real-time
                  </p>
                </div>
                <Link href="/pricing">
                  <Button variant="secondary" className="shrink-0">
                    View Plans
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Teams List */}
        {teamsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : teams && teams.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map(({ team, membership }) => (
              <Card key={team.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                        {team.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{team.name}</CardTitle>
                        <Badge className={`mt-1 ${getRoleBadgeColor(membership.role)}`}>
                          {getRoleIcon(membership.role)}
                          <span className="ml-1 capitalize">{membership.role}</span>
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {team.description && (
                    <CardDescription className="mt-2">{team.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-2">
                      {/* Placeholder avatars */}
                      <Avatar className="h-8 w-8 border-2 border-white">
                        <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                          {user?.name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex items-center gap-2">
                      {membership.role === 'admin' && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedTeamId(team.id);
                            setIsInviteOpen(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          Invite
                        </Button>
                      )}
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isPaidUser ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No teams yet</h3>
              <p className="text-slate-500 mb-4">
                Create your first team to start collaborating
              </p>
              <Button onClick={() => setIsCreateTeamOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Team
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Invite Member Dialog */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your team
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-purple-600" />
                        Admin - Full access
                      </div>
                    </SelectItem>
                    <SelectItem value="editor">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-blue-600" />
                        Editor - Can edit files
                      </div>
                    </SelectItem>
                    <SelectItem value="viewer">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-slate-600" />
                        Viewer - View only
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInviteMember} disabled={inviteMemberMutation.isPending}>
                {inviteMemberMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Mail className="h-4 w-4 mr-2" />
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Team Features */}
        <div className="grid md:grid-cols-3 gap-6 mt-8">
          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center mb-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <CardTitle className="text-lg">Role-Based Access</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Control who can view, edit, or manage documents with Admin, Editor, and Viewer roles.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center mb-2">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <CardTitle className="text-lg">Shared Workspaces</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create shared folders and collaborate on documents in real-time with your team.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center mb-2">
                <Crown className="h-5 w-5 text-purple-600" />
              </div>
              <CardTitle className="text-lg">Approval Workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Set up custom approval chains for documents that need review before publishing.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
