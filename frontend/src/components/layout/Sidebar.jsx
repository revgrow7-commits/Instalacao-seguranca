import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  BarChart3, 
  Calendar,
  LogOut,
  User,
  CheckCircle,
  FileText
} from 'lucide-react';
import { Button } from '../ui/button';

const Sidebar = () => {
  const { user, logout, isAdmin, isManager, isInstaller } = useAuth();
  const location = useLocation();

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'manager', 'installer']
    },
    {
      name: 'Jobs',
      href: '/jobs',
      icon: Briefcase,
      roles: ['admin', 'manager', 'installer']
    },
    {
      name: 'Check-ins',
      href: '/checkins',
      icon: CheckCircle,
      roles: ['admin', 'manager']
    },
    {
      name: 'Relatórios',
      href: '/reports',
      icon: FileText,
      roles: ['admin', 'manager']
    },
    {
      name: 'Calendário',
      href: '/calendar',
      icon: Calendar,
      roles: ['admin', 'manager']
    },
    {
      name: 'Métricas',
      href: '/metrics',
      icon: BarChart3,
      roles: ['admin', 'manager']
    },
    {
      name: 'Usuários',
      href: '/users',
      icon: Users,
      roles: ['admin']
    },
  ];

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role));

  return (
    <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="flex-1 flex flex-col min-h-0 bg-card border-r border-white/5">
        <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-4 mb-8">
            <div className="flex flex-col">
              <h1 className="text-2xl font-heading font-bold text-white tracking-tight">
                INDÚSTRIA
              </h1>
              <span className="text-lg font-heading text-primary">VISUAL</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="mt-5 flex-1 px-3 space-y-2" data-testid="sidebar-navigation">
            {filteredNav.map((item) => {
              const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  data-testid={`nav-link-${item.name.toLowerCase()}`}
                  className={
                    `group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary text-white neon-glow'
                        : 'text-gray-300 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="mr-3 flex-shrink-0 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User info & Logout */}
        <div className="flex-shrink-0 flex border-t border-white/5 p-4">
          <div className="flex items-center w-full">
            <div className="flex-1 min-w-0">
              <Link to="/profile" className="flex items-center group" data-testid="profile-link">
                <User className="h-8 w-8 rounded-full bg-primary/20 p-2 text-primary" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-white group-hover:text-primary transition-colors">
                    {user?.name}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {user?.role === 'admin' ? 'Administrador' : user?.role === 'manager' ? 'Gerente' : 'Instalador'}
                  </p>
                </div>
              </Link>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              data-testid="logout-button"
              className="ml-3 text-gray-400 hover:text-white"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;