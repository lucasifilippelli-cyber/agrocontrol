-- crear_perfil() sólo debe correr como disparador al darse de alta un usuario.
-- Al vivir en el esquema public quedaba publicada como /rest/v1/rpc/crear_perfil,
-- llamable por cualquiera. El disparador sigue funcionando igual sin ese permiso.
revoke execute on function public.crear_perfil() from public, anon, authenticated;
