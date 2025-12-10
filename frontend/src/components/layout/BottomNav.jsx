import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Briefcase, 
  Calendar,
  User
} from 'lucide-react';

const BottomNav = () => {
  const { user } = useAuth();
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
      name: 'Calendário',
      href: '/calendar',
      icon: Calendar,
      roles: ['admin', 'manager']
    },
    {
      name: 'Perfil',
      href: '/profile',
      icon: User,
      roles: ['admin', 'manager', 'installer']
    },
  ];

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role));

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-white/5 z-50">
      <nav className="flex justify-around items-center h-16" data-testid="bottom-navigation">
        {filteredNav.map((item) => {
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              to={item.href}
              data-testid={`bottom-nav-${item.name.toLowerCase()}`}
              className={
                `flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-gray-400 hover:text-white'
                }`
              }
            >
              <item.icon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;