import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  User,
  MapPin
} from 'lucide-react';

const BottomNav = () => {
  const { user } = useAuth();
  const location = useLocation();

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'manager']
    },
    {
      name: 'Dashboard',
      href: '/installer/dashboard',
      icon: LayoutDashboard,
      roles: ['installer']
    },
    {
      name: 'Jobs',
      href: '/jobs',
      icon: Briefcase,
      roles: ['admin', 'manager']
    },
    {
      name: 'Visitas',
      href: '/visitas-tecnicas',
      icon: MapPin,
      roles: ['admin', 'manager']
    },
    {
      name: 'Calendário',
      href: '/installer/calendar',
      icon: Calendar,
      roles: ['installer']
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

  const isActive = (item) => {
    if (location.pathname === item.href) return true;
    if (location.pathname.startsWith(item.href + '/')) return true;
    // Dashboard do installer deve ficar ativo em qualquer rota /installer/*
    if (item.href === '/installer/dashboard' && location.pathname.startsWith('/installer/')) return true;
    return false;
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-white/5 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <nav className="flex justify-around items-center h-16" data-testid="bottom-navigation">
        {filteredNav.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.name + item.href}
              to={item.href}
              data-testid={`bottom-nav-${item.name.toLowerCase()}`}
              className={
                `relative flex flex-col items-center justify-center flex-1 min-h-[56px] transition-colors ${
                  active
                    ? 'text-primary'
                    : 'text-gray-400 hover:text-white'
                }`
              }
            >
              <item.icon className="h-6 w-6 mb-1" />
              <span className="text-xs font-medium">{item.name}</span>
              {active && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;